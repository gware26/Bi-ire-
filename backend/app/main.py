import json
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ai, config, db, study


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db.init()
    yield


app = FastAPI(title="Biʼire API", lifespan=lifespan)


class SessionIn(BaseModel):
    course_name: str = ""


# Holds sessions whose course was left blank until the AI names the subject at the end.
AUTO_NOTEBOOK = ""


def _notebook_id(conn, course: str) -> int:
    conn.execute("INSERT OR IGNORE INTO notebooks (course_name, created_at) VALUES (?, ?)", (course, time.time()))
    return conn.execute("SELECT id FROM notebooks WHERE course_name = ?", (course,)).fetchone()["id"]


class BookmarkIn(BaseModel):
    at_sec: float
    trigger_type: str = "tap"


class EndIn(BaseModel):
    out_lang: str = "en"
    # lecture = classroom recording; dictation = student spoke a personal notebook entry.
    mode: str = "lecture"


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
    return {
        "ok": True,
        "demo_mode": config.DEMO_MODE,
        "model": (
            "addis-scribe"
            if config.ADDIS_API_KEY
            else config.GEMINI_MODEL
        ),
        "fallback": config.GEMINI_MODEL if config.ADDIS_API_KEY and config.GEMINI_API_KEY else None,
        "build": config.BUILD_ID,
    }


@app.post("/api/sessions")
def create_session(body: SessionIn):
    course = body.course_name.strip() or AUTO_NOTEBOOK
    with db.db() as conn:
        notebook_id = _notebook_id(conn, course)
        cur = conn.execute("INSERT INTO sessions (notebook_id, started_at) VALUES (?, ?)", (notebook_id, time.time()))
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
        known_subjects = [
            r["course_name"]
            for r in conn.execute(
                """SELECT DISTINCT nb.course_name FROM notebooks nb JOIN sessions s ON s.notebook_id = nb.id
                   WHERE s.status = 'done' AND nb.course_name != ''"""
            )
        ]
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
        mode = body.mode if body.mode in {"lecture", "dictation"} else "lecture"
        notes = await ai.make_notes(
            segments, bookmarked_ids, out_lang, course["course_name"], known_subjects, mode=mode
        )
    except ai.AIError as e:
        with db.db() as conn:
            conn.execute("UPDATE sessions SET status = 'failed' WHERE id = ?", (session_id,))
        raise HTTPException(502, str(e)) from e

    with db.db() as conn:
        if course["course_name"] == AUTO_NOTEBOOK:
            subject = " ".join(str(notes.get("subject", "")).split())[:60] or (
                "My notes" if mode == "dictation" else "General"
            )
            match = conn.execute(
                "SELECT course_name FROM notebooks WHERE lower(course_name) = lower(?) AND course_name != ''", (subject,)
            ).fetchone()
            nb = _notebook_id(conn, match["course_name"] if match else subject)
            conn.execute("UPDATE sessions SET notebook_id = ? WHERE id = ?", (nb, session_id))
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


# ---------- Study tools: materials, flashcards, study plan, chat tutor ----------

EXT_MIME = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp", ".txt": "text/plain", ".md": "text/markdown"}


class PlanIn(BaseModel):
    days: int = 7
    minutes: int = 30
    refresh: bool = False


def _materials(conn, note_id: int, with_data: bool = False) -> list[dict]:
    cols = "id, filename, mime, size, analysis, created_at" + (", data" if with_data else "")
    out = []
    for r in conn.execute(f"SELECT {cols} FROM materials WHERE note_id = ? ORDER BY id", (note_id,)):
        m = dict(r)
        m["analysis"] = json.loads(m["analysis"]) if m["analysis"] else None
        out.append(m)
    return out


def _cached(conn, note_id: int, kind: str):
    row = conn.execute("SELECT data FROM study_items WHERE note_id = ? AND kind = ?", (note_id, kind)).fetchone()
    return json.loads(row["data"]) if row else None


def _cache(conn, note_id: int, kind: str, data) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO study_items (note_id, kind, data, created_at) VALUES (?, ?, ?, ?)",
        (note_id, kind, json.dumps(data, ensure_ascii=False), time.time()),
    )


@app.get("/api/notes/{note_id}/materials")
def list_materials(note_id: int):
    with db.db() as conn:
        _note_payload(conn, note_id)
        return _materials(conn, note_id)


@app.post("/api/notes/{note_id}/materials")
async def upload_material(note_id: int, file: UploadFile = File(...)):
    name = (file.filename or "material").strip()
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    mime = (file.content_type or "").split(";")[0].strip()
    if mime not in study.SUPPORTED_MIME:
        mime = EXT_MIME.get(ext, mime)
    if mime not in study.SUPPORTED_MIME:
        raise HTTPException(415, "Use a PDF, an image (PNG/JPG) or a text file. Save Word or PowerPoint files as PDF first.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty")
    if len(data) > study.MAX_MATERIAL_BYTES:
        raise HTTPException(413, "The file is larger than 8 MB")

    with db.db() as conn:
        note = _note_payload(conn, note_id)
        cur = conn.execute(
            "INSERT INTO materials (note_id, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (note_id, name, mime, len(data), data, time.time()),
        )
        material_id = cur.lastrowid
        # New material changes what the flashcards and plan should cover.
        conn.execute("DELETE FROM study_items WHERE note_id = ?", (note_id,))

    material = {"id": material_id, "filename": name, "mime": mime, "size": len(data), "data": data}
    warning = None
    try:
        analysis = await study.link_material(note, material)
        with db.db() as conn:
            conn.execute("UPDATE materials SET analysis = ? WHERE id = ?", (json.dumps(analysis, ensure_ascii=False), material_id))
    except ai.AIError as e:
        warning = f"Saved, but it could not be linked to the lecture yet: {e}"
    with db.db() as conn:
        saved = next(m for m in _materials(conn, note_id) if m["id"] == material_id)
    return {**saved, "warning": warning}


@app.delete("/api/materials/{material_id}")
def delete_material(material_id: int):
    with db.db() as conn:
        row = conn.execute("SELECT note_id FROM materials WHERE id = ?", (material_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Material not found")
        conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
        conn.execute("DELETE FROM study_items WHERE note_id = ?", (row["note_id"],))
    return {"ok": True}


@app.post("/api/notes/{note_id}/flashcards")
async def flashcards(note_id: int, refresh: bool = False):
    with db.db() as conn:
        note = _note_payload(conn, note_id)
        cached = None if refresh else _cached(conn, note_id, "flashcards")
        materials = _materials(conn, note_id, with_data=True)
    if cached is not None:
        return {"cards": cached}
    try:
        cards = await study.make_flashcards(note, materials)
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e
    with db.db() as conn:
        _cache(conn, note_id, "flashcards", cards)
    return {"cards": cards}


@app.get("/api/notes/{note_id}/plan")
def get_plan(note_id: int):
    with db.db() as conn:
        _note_payload(conn, note_id)
        return {"plan": _cached(conn, note_id, "plan")}


@app.post("/api/notes/{note_id}/plan")
async def make_plan(note_id: int, body: PlanIn):
    days = max(1, min(body.days, 30))
    minutes = max(10, min(body.minutes, 240))
    with db.db() as conn:
        note = _note_payload(conn, note_id)
        cached = _cached(conn, note_id, "plan")
        materials = _materials(conn, note_id, with_data=True)
    if cached and not body.refresh and cached.get("params") == [days, minutes]:
        return {"plan": cached}
    try:
        plan = await study.make_study_plan(note, materials, days, minutes)
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e
    plan["params"] = [days, minutes]
    with db.db() as conn:
        _cache(conn, note_id, "plan", plan)
    return {"plan": plan}


def _chat_row(r) -> dict:
    return {"id": r["id"], "role": r["role"], "text": r["text"], "sources": json.loads(r["sources"]), "created_at": r["created_at"]}


@app.get("/api/notes/{note_id}/chat")
def chat_history(note_id: int):
    with db.db() as conn:
        _note_payload(conn, note_id)
        rows = conn.execute("SELECT * FROM chat_messages WHERE note_id = ? ORDER BY id", (note_id,)).fetchall()
        return [_chat_row(r) for r in rows]


@app.post("/api/notes/{note_id}/chat")
async def chat(note_id: int, text: str = Form(""), audio: UploadFile | None = File(None)):
    question = text.strip()
    audio_bytes = await audio.read() if audio else None
    if not question and not audio_bytes:
        raise HTTPException(400, "Ask a question by voice or text")
    with db.db() as conn:
        note = _note_payload(conn, note_id)
        materials = _materials(conn, note_id, with_data=True)
        history = [dict(r) for r in conn.execute("SELECT role, text FROM chat_messages WHERE note_id = ? ORDER BY id", (note_id,))]
    try:
        result = await study.chat(note, materials, history, question, audio_bytes, (audio.content_type if audio else None) or "audio/wav")
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e

    heard = (result.get("heard") or question).strip() or "(question)"
    sources = {"source_ids": result.get("source_ids", []), "materials": result.get("materials", [])}
    now = time.time()
    with db.db() as conn:
        q = conn.execute(
            "INSERT INTO chat_messages (note_id, role, text, created_at) VALUES (?, 'user', ?, ?)", (note_id, heard, now)
        )
        a = conn.execute(
            "INSERT INTO chat_messages (note_id, role, text, sources, created_at) VALUES (?, 'assistant', ?, ?, ?)",
            (note_id, result["answer"], json.dumps(sources, ensure_ascii=False), now),
        )
        rows = conn.execute("SELECT * FROM chat_messages WHERE id IN (?, ?) ORDER BY id", (q.lastrowid, a.lastrowid)).fetchall()
        return [_chat_row(r) for r in rows]


# ---------- Production: serve the built Vite app from the same origin as /api ----------

_STATIC = config.FRONTEND_DIST
if _STATIC.is_dir() and (_STATIC / "index.html").is_file():
    _assets = _STATIC / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/")
    def spa_index():
        return FileResponse(_STATIC / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(404, "Not found")
        candidate = (_STATIC / full_path).resolve()
        try:
            candidate.relative_to(_STATIC.resolve())
        except ValueError:
            raise HTTPException(404, "Not found") from None
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")
