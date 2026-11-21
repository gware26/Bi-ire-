"""All model calls (speech-to-text, note structuring, quiz) go through Gemini.

In demo mode every function returns scripted data from `demo.py`, so the full
flow works on stage even with no network or API key.
"""

import asyncio
import base64
import json
import ssl
import time

import httpx
import truststore

from . import config, demo

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Use the OS certificate store so school/venue networks that inspect HTTPS still verify.
SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

RETRYABLE_STATUS = {404, 429, 500, 502, 503, 504}

# model -> monotonic time when its quota should be back; skipped until then.
_exhausted_until: dict[str, float] = {}


def _retry_delay(r: httpx.Response) -> float:
    """Seconds until a 429'd model is worth retrying (Google's retryDelay, else 60s)."""
    try:
        for d in r.json()["error"].get("details", []):
            if "retryDelay" in d:
                return float(d["retryDelay"].rstrip("s"))
    except (ValueError, KeyError, TypeError):
        pass
    return 60.0


class AIError(RuntimeError):
    pass


def _lang(code: str) -> str:
    return config.LANGS.get(code, "English")


def _audio_part(audio: bytes, mime: str) -> dict:
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(audio).decode()}}


async def _post_with_reconnect(client: httpx.AsyncClient, model: str, body: dict) -> httpx.Response:
    """Posts once more after a short pause if the connection drops (flaky venue Wi-Fi)."""
    for attempt in range(2):
        try:
            return await client.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": config.GEMINI_API_KEY},
                json=body,
            )
        except httpx.ConnectError:
            if attempt:
                raise
            await asyncio.sleep(2)
    raise AssertionError("unreachable")


async def _gemini(parts: list[dict], schema: dict, temperature: float = 0.2) -> dict:
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    models = [config.GEMINI_MODEL, *(m for m in config.GEMINI_FALLBACK_MODELS if m != config.GEMINI_MODEL)]
    now = time.monotonic()
    ready = [m for m in models if _exhausted_until.get(m, 0) <= now]
    if not ready:
        raise AIError("All Gemini models are over their free-tier quota. Try later or use demo mode.")
    errors = []
    async with httpx.AsyncClient(timeout=config.GEMINI_TIMEOUT, verify=SSL_CONTEXT) as client:
        for model in ready:
            try:
                r = await _post_with_reconnect(client, model, body)
            except httpx.ConnectError as e:
                # No route to Google at all: every other model would fail the same way.
                raise AIError("No internet connection to Google Gemini. Check the Wi-Fi and try again.") from e
            except httpx.HTTPError as e:
                errors.append(f"{model}: {type(e).__name__}")
                continue
            if r.status_code == 200:
                break
            errors.append(f"{model}: {r.status_code}")
            if r.status_code == 429:
                _exhausted_until[model] = time.monotonic() + _retry_delay(r)
            if r.status_code not in RETRYABLE_STATUS:
                raise AIError(f"Gemini error {r.status_code}: {r.text[:300]}")
        else:
            raise AIError("Gemini unavailable (" + "; ".join(errors) + ")")
    data = r.json()
    try:
        text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise AIError(f"Unexpected Gemini response: {str(data)[:300]}") from e


TRANSCRIBE_PROMPT = """You are transcribing a short chunk of a university lecture recorded in Ethiopia.
The lecturer may switch between English, Amharic and Afaan Oromo, even inside one sentence.
The microphone is often quiet, distant, or low-volume — listen carefully for soft speech.

Rules:
- Transcribe exactly what is said. Do not translate, summarise or correct.
- Write Amharic in Ge'ez (Ethiopic) script, Afaan Oromo in Latin script (Qubee), English in Latin script.
- Keep English technical terms in English.
- Prefer transcribing quiet or low speech when words are audible, even if soft or muffled.
- If the audio is truly silent, only background noise, music or completely unintelligible, return an empty "text".
- Never invent, guess or complete speech. Only write words you actually hear; an empty "text" is better than made-up words.
- "languages": the codes actually spoken, chosen from: en, am, om.
"""

TRANSCRIBE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "text": {"type": "STRING"},
        "languages": {"type": "ARRAY", "items": {"type": "STRING", "enum": ["en", "am", "om"]}},
    },
    "required": ["text", "languages"],
}


async def transcribe(audio: bytes, mime: str, previous_text: str = "", seq: int = 0) -> dict:
    if config.DEMO_MODE:
        return demo.transcribe(seq)
    prompt = TRANSCRIBE_PROMPT
    if previous_text:
        prompt += f'\nThe previous chunk ended with: "{previous_text[-300:]}" (context only, do not repeat it).'
    return await _gemini([{"text": prompt}, _audio_part(audio, mime)], TRANSCRIBE_SCHEMA, temperature=0)


_ITEM = {
    "type": "OBJECT",
    "properties": {
        "text": {"type": "STRING"},
        "source_ids": {"type": "ARRAY", "items": {"type": "INTEGER"}},
    },
    "required": ["text", "source_ids"],
}

NOTES_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "subject": {"type": "STRING"},
        "title": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "definitions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "term": {"type": "STRING"},
                    "definition": {"type": "STRING"},
                    "source_ids": {"type": "ARRAY", "items": {"type": "INTEGER"}},
                },
                "required": ["term", "definition", "source_ids"],
            },
        },
        "takeaways": {"type": "ARRAY", "items": _ITEM},
        "exam_hints": {"type": "ARRAY", "items": _ITEM},
    },
    "required": ["subject", "title", "summary", "definitions", "takeaways", "exam_hints"],
}


async def make_notes(
    segments: list[dict],
    bookmarked_ids: set[int],
    out_lang: str,
    course: str,
    known_subjects: list[str] = (),
    mode: str = "lecture",
) -> dict:
    if config.DEMO_MODE:
        return demo.notes(segments, mode=mode)
    lines = "\n".join(
        f"[{s['id']}]{' (BOOKMARKED BY STUDENT)' if s['id'] in bookmarked_ids else ''} {s['text']}" for s in segments
    )
    known = ", ".join(f'"{s}"' for s in known_subjects) or "none yet"
    if mode == "dictation":
        if course:
            context = (
                f'The student dictated a personal notebook entry for the course "{course}". '
                "Clean it up into structured study notes."
            )
            subject_rule = f'- "subject": "{course}".'
        else:
            context = (
                "The student dictated a personal notebook entry (not a classroom lecture). "
                "Clean it up into structured study notes."
            )
            subject_rule = (
                '- "subject": the notebook this belongs in, in English, 1-4 words, Title Case '
                '(e.g. "My notes", "Biology", "Exam Prep"). '
                f"Existing notebooks: {known}. Reuse one only when it clearly fits; otherwise name a new one."
            )
        extra = (
            '- "summary": 2-4 short sentences that capture what the student said, cleaned up for reading aloud.\n'
            '- "takeaways": the main points the student wanted to remember.\n'
            '- "definitions": any terms they defined; empty if none.\n'
            '- "exam_hints": things they marked as important for an exam; empty if none.\n'
            "- Use ONLY what the student said. Never invent content."
        )
    else:
        if course:
            context = f'Turn this lecture transcript from the course "{course}" into structured study notes.'
            subject_rule = f'- "subject": "{course}".'
        else:
            context = "Turn this lecture transcript into structured study notes. The course was not given."
            subject_rule = (
                '- "subject": the academic subject or course this lecture belongs to, in English, 1-4 words, '
                'Title Case (e.g. "Data Structures", "Human Anatomy", "Ethiopian History"). '
                f"Existing subjects: {known}. Reuse one of those exact names ONLY if this lecture is clearly part of "
                "that same subject; otherwise name a new subject. Never force an unrelated lecture into an existing one."
            )
        extra = (
            '- "exam_hints": things the lecturer flagged as important or likely on the exam (in any language), '
            "repeated points, and lines the student bookmarked.\n"
            '- "summary": 2-4 short sentences that can be read aloud.\n'
            "- Use ONLY information in the transcript. Never add facts the lecturer did not say."
        )
    prompt = f"""You are an assistant for a student with a motor disability who cannot take notes by hand.
{context}

Rules:
{subject_rule}
- Write everything in {_lang(out_lang)}. Keep English technical terms in English (in brackets if needed).
- Every definition, takeaway and exam hint must cite the [id] numbers of the transcript lines it came from in "source_ids".
{extra}
- Keep each item short enough to be read aloud in under 15 seconds.

Transcript:
{lines}
"""
    return await _gemini([{"text": prompt}], NOTES_SCHEMA)


QUIZ_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"question": {"type": "STRING"}, "expected_answer": {"type": "STRING"}},
                "required": ["question", "expected_answer"],
            },
        }
    },
    "required": ["questions"],
}


async def make_quiz(note: dict, out_lang: str, count: int = 3) -> list[dict]:
    if config.DEMO_MODE:
        return demo.quiz()
    prompt = f"""Create {count} short spoken quiz questions from these study notes, in {_lang(out_lang)}.
Each question must be answerable in one short spoken sentence and use only the notes.
Prefer exam hints and definitions.

Notes (JSON):
{json.dumps(note, ensure_ascii=False)}
"""
    result = await _gemini([{"text": prompt}], QUIZ_SCHEMA, temperature=0.4)
    return result["questions"][:count]


GRADE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "heard": {"type": "STRING"},
        "correct": {"type": "BOOLEAN"},
        "feedback": {"type": "STRING"},
    },
    "required": ["heard", "correct", "feedback"],
}


async def grade_spoken_answer(audio: bytes, mime: str, question: str, expected: str, out_lang: str) -> dict:
    if config.DEMO_MODE:
        return demo.grade(expected)
    prompt = f"""A student answered a quiz question out loud. The audio is attached.
1. "heard": transcribe the student's answer exactly (they may mix English, Amharic and Afaan Oromo).
2. "correct": true if the meaning matches the expected answer. Be lenient with wording, grammar and accent.
3. "feedback": one or two encouraging sentences in {_lang(out_lang)}. If wrong or silent, give the correct answer.

Question: {question}
Expected answer: {expected}
"""
    return await _gemini([{"text": prompt}, _audio_part(audio, mime)], GRADE_SCHEMA)
