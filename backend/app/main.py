import json
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from . import ai, config, db


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    yield


app = FastAPI(title="LissanNote API", lifespan=lifespan)


class SessionIn(BaseModel):
    course_name: str = "General"


class BookmarkIn(BaseModel):
    at_sec: float
    trigger_type: str = "tap"


class EndIn(BaseModel):
    out_lang: str = "en"


def _segment(row) -> dict:
    return {
        "id": row["id"],
        "seq": row["seq"],
        "start_sec": row["start_sec"],
        "end_sec": row["end_sec"],
        "langs": json.loads(row["langs"]),
        "text": row["text"],
    }


def _get_session(conn, session_id: int):
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found")
    return row


def _note_payload(conn, note_id: int) -> dict:
    row = conn.execute(
        """SELECT n.*, nb.course_name FROM notes n
           JOIN sessions s ON s.id = n.session_id
           JOIN notebooks nb ON nb.id = s.notebook_id
           WHERE n.id = ?""",
        (note_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Note not found")
    segments = conn.execute(
        "SELECT * FROM segments WHERE session_id = ? ORDER BY start_sec", (row["session_id"],)
    ).fetchall()
    bookmarks = conn.execute(
        "SELECT at_sec, trigger_type FROM bookmarks WHERE session_id = ? ORDER BY at_sec", (row["session_id"],)
    ).fetchall()
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "course_name": row["course_name"],
        "out_lang": row["out_lang"],
        "title": row["title"],
        "summary": row["summary"],
        "definitions": json.loads(row["definitions"]),
        "takeaways": json.loads(row["takeaways"]),
        "exam_hints": json.loads(row["exam_hints"]),
        "created_at": row["created_at"],
        "segments": [_segment(s) for s in segments],
        "bookmarks": [dict(b) for b in bookmarks],
    }


@app.get("/api/health")
def health():
    return {"ok": True, "demo_mode": config.DEMO_MODE, "model": config.GEMINI_MODEL}


@app.post("/api/sessions")
def create_session(body: SessionIn):
    course = body.course_name.strip() or "General"
    now = time.time()
    with db.db() as conn:
        conn.execute("INSERT OR IGNORE INTO notebooks (course_name, created_at) VALUES (?, ?)", (course, now))
        notebook_id = conn.execute("SELECT id FROM notebooks WHERE course_name = ?", (course,)).fetchone()["id"]
        cur = conn.execute("INSERT INTO sessions (notebook_id, started_at) VALUES (?, ?)", (notebook_id, now))
        return {"session_id": cur.lastrowid}


@app.post("/api/sessions/{session_id}/chunks")
async def add_chunk(
    session_id: int,
    audio: UploadFile = File(...),
    seq: int = Form(...),
    start_sec: float = Form(...),
    end_sec: float = Form(...),
):
    with db.db() as conn:
        if _get_session(conn, session_id)["status"] != "recording":
            raise HTTPException(409, "Session is no longer recording")
        prev = conn.execute(
            "SELECT text FROM segments WHERE session_id = ? AND start_sec < ? ORDER BY start_sec DESC LIMIT 1",
            (session_id, start_sec),
        ).fetchone()

    data = await audio.read()
    try:
        result = await ai.transcribe(data, audio.content_type or "audio/wav", prev["text"] if prev else "", seq)
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e

    text = result.get("text", "").strip()
    if not text:
        return {"segment": None}
    with db.db() as conn:
        cur = conn.execute(
            "INSERT INTO segments (session_id, seq, start_sec, end_sec, langs, text) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, seq, start_sec, end_sec, json.dumps(result.get("languages", [])), text),
        )
        row = conn.execute("SELECT * FROM segments WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"segment": _segment(row)}


@app.post("/api/sessions/{session_id}/bookmarks")
def add_bookmark(session_id: int, body: BookmarkIn):
    with db.db() as conn:
        _get_session(conn, session_id)
        cur = conn.execute(
            "INSERT INTO bookmarks (session_id, at_sec, trigger_type) VALUES (?, ?, ?)",
            (session_id, body.at_sec, body.trigger_type),
        )
        return {"id": cur.lastrowid, "at_sec": body.at_sec}


@app.post("/api/sessions/{session_id}/end")
async def end_session(session_id: int, body: EndIn):
    out_lang = body.out_lang if body.out_lang in config.LANGS else "en"
    with db.db() as conn:
        session = _get_session(conn, session_id)
        existing = conn.execute("SELECT id FROM notes WHERE session_id = ?", (session_id,)).fetchone()
        if existing:
            return _note_payload(conn, existing["id"])
        course = conn.execute("SELECT course_name FROM notebooks WHERE id = ?", (session["notebook_id"],)).fetchone()
        segments = [
            _segment(r)
            for r in conn.execute("SELECT * FROM segments WHERE session_id = ? ORDER BY start_sec", (session_id,))
        ]
        bookmarks = [r["at_sec"] for r in conn.execute("SELECT at_sec FROM bookmarks WHERE session_id = ?", (session_id,))]
        conn.execute("UPDATE sessions SET status = 'processing', ended_at = ? WHERE id = ?", (time.time(), session_id))

    if not segments:
        with db.db() as conn:
            conn.execute("UPDATE sessions SET status = 'failed' WHERE id = ?", (session_id,))
        raise HTTPException(422, "No speech was captured in this session")

    # A bookmark marks what was just said, so attach it to the latest segment that started before it.
    bookmarked_ids = set()
    for at in bookmarks:
        before = [s for s in segments if s["start_sec"] <= at]
        if before:
            bookmarked_ids.add(before[-1]["id"])

    try:
        notes = await ai.make_notes(segments, bookmarked_ids, out_lang, course["course_name"])
    except ai.AIError as e:
        with db.db() as conn:
            conn.execute("UPDATE sessions SET status = 'failed' WHERE id = ?", (session_id,))
        raise HTTPException(502, str(e)) from e

    with db.db() as conn:
        cur = conn.execute(
            """INSERT INTO notes (session_id, out_lang, title, summary, definitions, takeaways, exam_hints, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                out_lang,
                notes["title"],
                notes["summary"],
                json.dumps(notes["definitions"], ensure_ascii=False),
                json.dumps(notes["takeaways"], ensure_ascii=False),
                json.dumps(notes["exam_hints"], ensure_ascii=False),
                time.time(),
            ),
        )
        conn.execute("UPDATE sessions SET status = 'done' WHERE id = ?", (session_id,))
        return _note_payload(conn, cur.lastrowid)


@app.get("/api/notes")
def list_notes():
    with db.db() as conn:
        rows = conn.execute(
            """SELECT n.id, n.title, n.created_at, nb.course_name FROM notes n
               JOIN sessions s ON s.id = n.session_id
               JOIN notebooks nb ON nb.id = s.notebook_id
               ORDER BY n.created_at DESC LIMIT 20"""
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/notes/{note_id}")
def get_note(note_id: int):
    with db.db() as conn:
        return _note_payload(conn, note_id)


@app.post("/api/notes/{note_id}/quiz")
async def create_quiz(note_id: int):
    with db.db() as conn:
        note = _note_payload(conn, note_id)
    study = {k: note[k] for k in ("title", "summary", "definitions", "takeaways", "exam_hints")}
    try:
        questions = await ai.make_quiz(study, note["out_lang"])
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e

    now = time.time()
    out = []
    with db.db() as conn:
        for q in questions:
            cur = conn.execute(
                "INSERT INTO quiz_attempts (note_id, question, expected, created_at) VALUES (?, ?, ?, ?)",
                (note_id, q["question"], q["expected_answer"], now),
            )
            out.append({"id": cur.lastrowid, "question": q["question"]})
    return {"out_lang": note["out_lang"], "questions": out}


@app.post("/api/quiz-attempts/{attempt_id}/answer")
async def answer_quiz(attempt_id: int, audio: UploadFile = File(...)):
    with db.db() as conn:
        row = conn.execute(
            "SELECT qa.*, n.out_lang FROM quiz_attempts qa JOIN notes n ON n.id = qa.note_id WHERE qa.id = ?",
            (attempt_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Quiz question not found")

    data = await audio.read()
    try:
        result = await ai.grade_spoken_answer(
            data, audio.content_type or "audio/wav", row["question"], row["expected"], row["out_lang"]
        )
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e

    with db.db() as conn:
        conn.execute(
            "UPDATE quiz_attempts SET spoken_answer = ?, correct = ?, feedback = ? WHERE id = ?",
            (result["heard"], int(result["correct"]), result["feedback"], attempt_id),
        )
    return {**result, "expected": row["expected"]}
