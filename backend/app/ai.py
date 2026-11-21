"""All model calls (speech-to-text, note structuring, quiz) go through Gemini.

In demo mode every function returns scripted data from `demo.py`, so the full
flow works on stage even with no network or API key.
"""

import base64
import json

import httpx

from . import config, demo

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class AIError(RuntimeError):
    pass


def _lang(code: str) -> str:
    return config.LANGS.get(code, "English")


def _audio_part(audio: bytes, mime: str) -> dict:
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(audio).decode()}}


async def _gemini(parts: list[dict], schema: dict, temperature: float = 0.2) -> dict:
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    url = GEMINI_URL.format(model=config.GEMINI_MODEL)
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, headers={"x-goog-api-key": config.GEMINI_API_KEY}, json=body)
    except httpx.HTTPError as e:
        raise AIError(f"Could not reach Gemini: {e}") from e
    if r.status_code != 200:
        raise AIError(f"Gemini error {r.status_code}: {r.text[:300]}")
    data = r.json()
    try:
        text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise AIError(f"Unexpected Gemini response: {str(data)[:300]}") from e


TRANSCRIBE_PROMPT = """You are transcribing a short chunk of a university lecture recorded in Ethiopia.
The lecturer may switch between English, Amharic and Afaan Oromo, even inside one sentence.

Rules:
- Transcribe exactly what is said. Do not translate, summarise or correct.
- Write Amharic in Ge'ez (Ethiopic) script, Afaan Oromo in Latin script (Qubee), English in Latin script.
- Keep English technical terms in English.
- If the audio is silent, music or unintelligible, return an empty "text".
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
    "required": ["title", "summary", "definitions", "takeaways", "exam_hints"],
}


async def make_notes(segments: list[dict], bookmarked_ids: set[int], out_lang: str, course: str) -> dict:
    if config.DEMO_MODE:
        return demo.notes(segments)
    lines = "\n".join(
        f"[{s['id']}]{' (BOOKMARKED BY STUDENT)' if s['id'] in bookmarked_ids else ''} {s['text']}" for s in segments
    )
    prompt = f"""You are an assistant for a student with a motor disability who cannot take notes by hand.
Turn this lecture transcript from the course "{course}" into structured study notes.

Rules:
- Write everything in {_lang(out_lang)}. Keep English technical terms in English (in brackets if needed).
- Use ONLY information in the transcript. Never add facts the lecturer did not say.
- Every definition, takeaway and exam hint must cite the [id] numbers of the transcript lines it came from in "source_ids".
- "exam_hints": things the lecturer flagged as important or likely on the exam (in any language), repeated points,
  and lines the student bookmarked.
- "summary": 2-4 short sentences that can be read aloud.
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
