"""Study tools built on a lecture note plus the student's uploaded materials:
material linking, flashcards, a study plan and a grounded chat tutor."""

import base64
import json

from . import config, demo
from .ai import _gemini, _lang, transcribe

# Gemini reads these directly; Office files must be saved as PDF first.
SUPPORTED_MIME = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/markdown",
}
MAX_MATERIAL_BYTES = 8 * 1024 * 1024
# Keep the whole request under Gemini's ~20 MB inline limit.
MAX_CONTEXT_BYTES = 14 * 1024 * 1024


def _lecture_text(note: dict) -> str:
    lines = "\n".join(f"[{s['id']}] {s['text']}" for s in note["segments"])
    study = {k: note[k] for k in ("title", "summary", "definitions", "takeaways", "exam_hints")}
    return (
        f"LECTURE NOTES (JSON):\n{json.dumps(study, ensure_ascii=False)}\n\n"
        f"LECTURE TRANSCRIPT (each line starts with its [id]):\n{lines}"
    )


def _material_parts(materials: list[dict]) -> list[dict]:
    parts, used = [], 0
    for m in materials:
        if used + m["size"] > MAX_CONTEXT_BYTES:
            break
        used += m["size"]
        parts.append({"text": f'\nSTUDENT MATERIAL "{m["filename"]}":'})
        if m["mime"].startswith("text/"):
            parts.append({"text": m["data"].decode("utf-8", errors="replace")[:200_000]})
        else:
            parts.append({"inline_data": {"mime_type": m["mime"], "data": base64.b64encode(m["data"]).decode()}})
    return parts


_SOURCE_IDS = {"type": "ARRAY", "items": {"type": "INTEGER"}}

LINK_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "links": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"point": {"type": "STRING"}, "source_ids": _SOURCE_IDS},
                "required": ["point", "source_ids"],
            },
        },
        "extra": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["summary", "links", "extra"],
}


async def link_material(note: dict, material: dict) -> dict:
    """How one uploaded file relates to the recorded lecture."""
    if config.DEMO_MODE:
        return demo.material_links(note)
    prompt = f"""A student uploaded a study material for the lecture below. Relate it to the lecture.
Write everything in {_lang(note["out_lang"])}; keep English technical terms in English.

- "summary": 1-2 sentences on what the material covers.
- "links": up to 6 points where the material and the lecture talk about the same thing. Each point says what the
  material adds or confirms, and "source_ids" cites the [id] transcript lines it matches.
- "extra": up to 4 important points that are in the material but were NOT said in the lecture.
Keep each item short enough to read aloud in under 15 seconds.

{_lecture_text(note)}
"""
    return await _gemini(
        [{"text": prompt}, *_material_parts([material])], LINK_SCHEMA, out_lang=note.get("out_lang", "en")
    )


FLASHCARD_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "cards": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "front": {"type": "STRING"},
                    "back": {"type": "STRING"},
                    "source": {"type": "STRING"},
                    "source_ids": _SOURCE_IDS,
                },
                "required": ["front", "back", "source", "source_ids"],
            },
        }
    },
    "required": ["cards"],
}


async def make_flashcards(note: dict, materials: list[dict], count: int = 10) -> list[dict]:
    if config.DEMO_MODE:
        return demo.flashcards(note)
    prompt = f"""Make {count} flashcards for revising this lecture, in {_lang(note["out_lang"])}.
Keep English technical terms in English.

- "front": a short question or term (under 15 words). "back": the answer in 1-2 short sentences.
- Cover exam hints and definitions first, then main takeaways, then the student's materials.
- "source": "lecture" if it comes from the lecture, otherwise the material's file name.
- "source_ids": the [id] transcript lines it comes from (empty if only from a material).
- Use only the lecture and the materials; never invent facts.

{_lecture_text(note)}
"""
    result = await _gemini(
        [{"text": prompt}, *_material_parts(materials)], FLASHCARD_SCHEMA, temperature=0.4, out_lang=note.get("out_lang", "en")
    )
    return result["cards"][:count]


PLAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "goal": {"type": "STRING"},
        "days": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "day": {"type": "INTEGER"},
                    "focus": {"type": "STRING"},
                    "minutes": {"type": "INTEGER"},
                    "tasks": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["day", "focus", "minutes", "tasks"],
            },
        },
    },
    "required": ["goal", "days"],
}


async def make_study_plan(note: dict, materials: list[dict], days: int, minutes: int) -> dict:
    if config.DEMO_MODE:
        return demo.study_plan(days, minutes)
    prompt = f"""Make a {days}-day study plan to master this lecture before an exam, in {_lang(note["out_lang"])}.
The student has about {minutes} minutes per day and a motor disability: they study hands-free with voice.

- "goal": one sentence on what they will be able to do after the plan.
- One entry per day (day 1 to {days}). "focus": the topic of the day. "minutes": at most {minutes}.
- "tasks": 2-4 short, concrete tasks. Use the app's hands-free tools by name: "Listen to the notes",
  "Flashcards", "Voice quiz", "Ask the tutor", and the student's materials by file name.
- Put the exam hints early and repeat them near the end (spaced repetition). The last day is a full review.

{_lecture_text(note)}
"""
    return await _gemini(
        [{"text": prompt}, *_material_parts(materials)], PLAN_SCHEMA, temperature=0.3, out_lang=note.get("out_lang", "en")
    )


CHAT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "heard": {"type": "STRING"},
        "answer": {"type": "STRING"},
        "source_ids": _SOURCE_IDS,
        "materials": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["heard", "answer", "source_ids", "materials"],
}


async def chat(
    note: dict,
    materials: list[dict],
    history: list[dict],
    question: str = "",
    audio: bytes | None = None,
    mime: str = "audio/wav",
) -> dict:
    if config.DEMO_MODE:
        return demo.chat(question)
    past = "\n".join(f"{'Student' if h['role'] == 'user' else 'Tutor'}: {h['text']}" for h in history[-8:])
    if audio:
        heard = await transcribe(audio, mime)
        asked = f"Student's question: {heard.get('text') or '(silence)'}"
    else:
        asked = f"Student's question: {question}"
    prompt = f"""You are a patient study tutor for a university student with a motor disability.
Answer questions about the lecture below and the student's materials. Your answer will be read aloud.

Rules:
- "heard": the student's question as text (transcribe it if it is audio; they may mix English, Amharic and
  Afaan Oromo).
- "answer": reply in the language the student used ({_lang(note["out_lang"])} if unclear). At most 4 short
  sentences. Plain text, no markdown or lists. Explain simply, with an example when helpful.
- Base the answer on the lecture and materials. If they do not cover it, say so briefly, then give a short
  general explanation and say it was not in the lecture.
- "source_ids": the [id] transcript lines you used. "materials": file names of the materials you used.

{_lecture_text(note)}

Conversation so far:
{past or "(none)"}

{asked}
"""
    parts = [{"text": prompt}, *_material_parts(materials)]
    return await _gemini(parts, CHAT_SCHEMA, temperature=0.3, out_lang=note.get("out_lang", "en"))
