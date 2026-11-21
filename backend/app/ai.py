"""All model calls go through Addis AI: Scribe for speech-to-text, Aleph for notes/quiz/chat.

In demo mode every function returns scripted data from `demo.py`.
"""

import asyncio
import base64
import json
import re
import ssl
import time
import uuid

import httpx
import truststore

from . import config, demo

# Use the OS certificate store so school/venue networks that inspect HTTPS still verify.
SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

SCRIBE_URL = "/api/v1/scribe/transcribe"
CHAT_URL = "/api/v1/chat_generate"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
GEMINI_RETRYABLE = {404, 429, 500, 502, 503, 504}
_exhausted_until: dict[str, float] = {}


class AIError(RuntimeError):
    pass


def _lang(code: str) -> str:
    return config.LANGS.get(code, "English")


def _headers() -> dict:
    return {"x-api-key": config.ADDIS_API_KEY}


def _audio_part(audio: bytes, mime: str) -> dict:
    return {"audio": audio, "mime_type": mime}


def _ext(mime: str) -> str:
    if "wav" in mime:
        return "wav"
    if "mpeg" in mime or "mp3" in mime:
        return "mp3"
    if "webm" in mime:
        return "webm"
    if "ogg" in mime:
        return "ogg"
    return "wav"


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _chat_text(data: dict) -> str:
    if not isinstance(data, dict):
        return str(data)
    if data.get("response_text"):
        return str(data["response_text"])
    inner = data.get("data")
    if isinstance(inner, dict) and inner.get("response_text"):
        return str(inner["response_text"])
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        pass
    if isinstance(data.get("text"), str):
        return data["text"]
    raise AIError(f"Unexpected Addis chat response: {str(data)[:300]}")


async def _post_json(path: str, body: dict) -> httpx.Response:
    url = f"{config.ADDIS_BASE}{path}"
    last_err = "Addis AI request failed"
    async with httpx.AsyncClient(timeout=config.ADDIS_TIMEOUT, verify=SSL_CONTEXT) as client:
        for attempt in range(3):
            try:
                r = await client.post(url, headers=_headers(), json=body)
            except httpx.ConnectError as e:
                raise AIError("No internet connection to Addis AI. Check the Wi-Fi and try again.") from e
            except httpx.HTTPError as e:
                last_err = type(e).__name__
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code == 200:
                return r
            last_err = f"{r.status_code}: {r.text[:240]}"
            if r.status_code == 402:
                raise AIError(
                    "Addis AI wallet is empty. Top up at https://addisassistant.com then try again."
                )
            if r.status_code not in RETRYABLE_STATUS:
                raise AIError(f"Addis AI error {last_err}")
            wait = float(r.headers.get("Retry-After") or 1.5 * (attempt + 1))
            await asyncio.sleep(min(wait, 8))
    raise AIError(f"Addis AI unavailable ({last_err})")


async def _scribe(audio: bytes, mime: str, language: str) -> str:
    """Transcribe one clip with Addis Scribe. Empty string = silence / no speech."""
    url = f"{config.ADDIS_BASE}{SCRIBE_URL}"
    params = {
        "backend": "turbo",
        "language": language,
        "request_id": uuid.uuid4().hex,
    }
    files = {"audio": (f"chunk.{_ext(mime)}", audio, mime or "audio/wav")}
    async with httpx.AsyncClient(timeout=config.ADDIS_TIMEOUT, verify=SSL_CONTEXT) as client:
        try:
            r = await client.post(url, headers=_headers(), params=params, files=files)
        except httpx.ConnectError as e:
            raise AIError("No internet connection to Addis AI. Check the Wi-Fi and try again.") from e
        except httpx.HTTPError as e:
            raise AIError(f"Addis Scribe failed: {type(e).__name__}") from e
    if r.status_code == 202:
        # Long job — our chunks are short; treat as empty rather than blocking.
        return ""
    if r.status_code == 402:
        raise AIError("Addis AI wallet is empty. Top up at https://addisassistant.com then try again.")
    if r.status_code != 200:
        raise AIError(f"Addis Scribe error {r.status_code}: {r.text[:300]}")
    data = r.json()
    payload = data.get("data", data)
    if isinstance(payload, dict):
        return str(payload.get("text") or "").strip()
    return str(data.get("text") or "").strip()


def _flatten_parts(parts: list[dict]) -> str:
    chunks = []
    for p in parts:
        if p.get("text"):
            chunks.append(p["text"])
        elif p.get("audio"):
            chunks.append("[audio attached — transcribe it from the separate speech-to-text step]")
        elif p.get("inline_data"):
            chunks.append("[file attached]")
    return "\n".join(chunks)


def _parts_for_gemini(parts: list[dict]) -> list[dict]:
    out = []
    for p in parts:
        if p.get("text"):
            out.append({"text": p["text"]})
        elif p.get("audio"):
            out.append(
                {
                    "inline_data": {
                        "mime_type": p.get("mime_type") or "audio/wav",
                        "data": base64.b64encode(p["audio"]).decode(),
                    }
                }
            )
        elif p.get("inline_data"):
            out.append({"inline_data": p["inline_data"]})
    return out


def _retry_delay(r: httpx.Response) -> float:
    try:
        for d in r.json()["error"].get("details", []):
            if "retryDelay" in d:
                return float(d["retryDelay"].rstrip("s"))
    except (ValueError, KeyError, TypeError):
        pass
    return 60.0


async def _gemini_complete(parts: list[dict], schema: dict, temperature: float = 0.2) -> dict:
    if not config.GEMINI_API_KEY:
        raise AIError("No Gemini API key set for fallback.")
    body = {
        "contents": [{"role": "user", "parts": _parts_for_gemini(parts)}],
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
        raise AIError("Gemini fallback is over quota. Try later.")
    errors = []
    r = None
    async with httpx.AsyncClient(timeout=config.GEMINI_TIMEOUT, verify=SSL_CONTEXT) as client:
        for model in ready:
            try:
                r = await client.post(
                    GEMINI_URL.format(model=model),
                    headers={"x-goog-api-key": config.GEMINI_API_KEY},
                    json=body,
                )
            except httpx.ConnectError as e:
                raise AIError("No internet connection to Gemini. Check the Wi-Fi and try again.") from e
            except httpx.HTTPError as e:
                errors.append(f"{model}: {type(e).__name__}")
                continue
            if r.status_code == 200:
                break
            errors.append(f"{model}: {r.status_code}")
            if r.status_code == 429:
                _exhausted_until[model] = time.monotonic() + _retry_delay(r)
            if r.status_code not in GEMINI_RETRYABLE:
                raise AIError(f"Gemini error {r.status_code}: {r.text[:300]}")
        else:
            raise AIError("Gemini unavailable (" + "; ".join(errors) + ")")
    data = r.json()
    try:
        text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise AIError(f"Unexpected Gemini response: {str(data)[:300]}") from e


async def _addis_complete(parts: list[dict], schema: dict, temperature: float, out_lang: str) -> dict:
    prompt = (
        _flatten_parts(parts)
        + "\n\nReturn ONLY valid JSON. No markdown. Match this schema:\n"
        + json.dumps(schema)
    )
    target = out_lang if out_lang in {"en", "am", "om", "ti"} else "en"
    body = {
        "prompt": prompt,
        "target_language": target,
        "generation_config": {"temperature": temperature, "maxOutputTokens": 2048},
    }
    r = await _post_json(CHAT_URL, body)
    try:
        return _parse_json(_chat_text(r.json()))
    except (json.JSONDecodeError, AIError) as e:
        raise AIError(f"Addis AI returned non-JSON: {r.text[:300]}") from e


async def _gemini(parts: list[dict], schema: dict, temperature: float = 0.2, out_lang: str = "en") -> dict:
    """Addis-Aleph first; Gemini if Addis fails. Name kept so study.py can keep importing it."""
    addis_err = None
    if config.ADDIS_API_KEY:
        try:
            return await _addis_complete(parts, schema, temperature, out_lang)
        except AIError as e:
            addis_err = e
    if config.GEMINI_API_KEY:
        return await _gemini_complete(parts, schema, temperature)
    if addis_err:
        raise addis_err
    raise AIError("No Addis or Gemini API key is set.")


# Ethiopic / Ge'ez — real Amharic transcripts must contain these.
_GEEZ_RE = re.compile(r"[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]")


def _normalize_transcript(text: str, lang: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {"text": "", "languages": []}
    has_geez = bool(_GEEZ_RE.search(text))
    if has_geez:
        langs = ["am"]
        if lang == "en":
            langs.insert(0, "en")
    elif lang in {"am", "om", "en"}:
        langs = [lang]
    else:
        langs = ["en"]
    return {"text": text, "languages": langs}


TRANSCRIBE_PROMPT = """You are transcribing a short chunk of a university lecture recorded in Ethiopia.
Default language is English. Only mark Amharic or Afaan Oromo when you clearly hear them.
Transcribe exactly what is said. Do not invent speech. Empty text if silent.
"languages": codes actually spoken: en, am, om. English only → ["en"].
"""

TRANSCRIBE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "text": {"type": "STRING"},
        "languages": {"type": "ARRAY", "items": {"type": "STRING", "enum": ["en", "am", "om"]}},
    },
    "required": ["text", "languages"],
}


async def _transcribe_gemini(audio: bytes, mime: str, previous_text: str = "") -> dict:
    prompt = TRANSCRIBE_PROMPT
    if previous_text:
        prompt += f'\nPrevious chunk ended with: "{previous_text[-300:]}" (context only).'
    result = await _gemini_complete(
        [{"text": prompt}, {"audio": audio, "mime_type": mime or "audio/wav"}],
        TRANSCRIBE_SCHEMA,
        temperature=0,
    )
    text = (result.get("text") or "").strip()
    lang = "am" if _GEEZ_RE.search(text) else "en"
    claimed = result.get("languages") or []
    if "om" in claimed and not _GEEZ_RE.search(text):
        lang = "om" if "en" not in claimed else "en"
    return _normalize_transcript(text, lang)


async def transcribe(audio: bytes, mime: str, previous_text: str = "", seq: int = 0) -> dict:
    if config.DEMO_MODE:
        return demo.transcribe(seq)
    addis_err = None
    if config.ADDIS_API_KEY:
        primary = config.ADDIS_STT_LANG if config.ADDIS_STT_LANG in {"en", "am", "om"} else "en"
        if previous_text and _GEEZ_RE.search(previous_text):
            order = ["am", "en", "om"]
        else:
            order = [primary, *(c for c in ("en", "am", "om") if c != primary)]
        for lang in order:
            try:
                text = await _scribe(audio, mime, lang)
            except AIError as e:
                addis_err = e
                break
            if text:
                return _normalize_transcript(text, lang)
        else:
            return {"text": "", "languages": []}
    if config.GEMINI_API_KEY:
        return await _transcribe_gemini(audio, mime, previous_text)
    if addis_err:
        raise addis_err
    raise AIError("No Addis or Gemini API key is set.")


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
    return await _gemini([{"text": prompt}], NOTES_SCHEMA, out_lang=out_lang)


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
    result = await _gemini([{"text": prompt}], QUIZ_SCHEMA, temperature=0.4, out_lang=out_lang)
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
    heard = await transcribe(audio, mime)
    prompt = f"""A student answered a quiz question out loud.
1. "heard": the student's answer as text (already transcribed below).
2. "correct": true if the meaning matches the expected answer. Be lenient with wording, grammar and accent.
3. "feedback": one or two encouraging sentences in {_lang(out_lang)}. If wrong or silent, give the correct answer.

Question: {question}
Expected answer: {expected}
Student said: {heard.get("text") or "(silence)"}
"""
    result = await _gemini([{"text": prompt}], GRADE_SCHEMA, out_lang=out_lang)
    if not result.get("heard"):
        result["heard"] = heard.get("text") or ""
    return result
