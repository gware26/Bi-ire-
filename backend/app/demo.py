"""Scripted lecture used when DEMO_MODE is on (or no API key is set).

Have a native speaker check the Amharic and Afaan Oromo lines, and replace this
script with the one your teammate reads during the live demo.
"""

LECTURE = [
    ("Good morning everyone. Today we start a new topic: stacks and queues.", ["en"]),
    ("Stack የሚባለው linear data structure ነው። መጨረሻ የገባው መጀመሪያ ይወጣል — we call this LIFO, last in first out.", ["am", "en"]),
    ("The two main operations are push, which adds an element to the top, and pop, which removes the top element.", ["en"]),
    ("Queue immoo FIFO dha — first in, first out. Kan duraan seene duraan ba'a.", ["om", "en"]),
    ("In a queue we use enqueue to add at the rear and dequeue to remove from the front.", ["en"]),
    ("Kun qormaata irratti ni dhufa: what is the difference between a stack and a queue? ይህንን በደንብ አጥኑ።", ["om", "en", "am"]),
    ("A real example: the undo button in a text editor uses a stack, and a printer uses a queue.", ["en"]),
    ("Next week we will implement both using arrays and linked lists.", ["en"]),
]


def transcribe(seq: int) -> dict:
    if seq >= len(LECTURE):
        return {"text": "", "languages": []}
    text, langs = LECTURE[seq]
    return {"text": text, "languages": langs}


def notes(segments: list[dict], mode: str = "lecture") -> dict:
    ids = [s["id"] for s in segments]

    def src(*positions: int) -> list[int]:
        return [ids[p] for p in positions if p < len(ids)]

    if mode == "dictation":
        return {
            "subject": "My notes",
            "title": "Spoken study note",
            "summary": " ".join(s["text"] for s in segments[:2]) or "A short spoken note from the student.",
            "definitions": [],
            "takeaways": [
                {"text": s["text"][:160], "source_ids": [s["id"]]}
                for s in segments[:3]
            ]
            or [{"text": "Remember to review this before the exam.", "source_ids": src(0)}],
            "exam_hints": [],
        }

    return {
        "subject": "Data Structures",
        "title": "Stacks and Queues",
        "summary": (
            "A stack is a linear data structure where the last element added is the first removed (LIFO). "
            "A queue removes elements in the order they arrived (FIFO). "
            "The difference between them will come on the exam."
        ),
        "definitions": [
            {"term": "Stack", "definition": "A linear data structure that follows LIFO: last in, first out.", "source_ids": src(1)},
            {"term": "Queue", "definition": "A linear data structure that follows FIFO: first in, first out.", "source_ids": src(3)},
            {"term": "Push / Pop", "definition": "Push adds an element to the top of a stack; pop removes the top element.", "source_ids": src(2)},
            {"term": "Enqueue / Dequeue", "definition": "Enqueue adds at the rear of a queue; dequeue removes from the front.", "source_ids": src(4)},
        ],
        "takeaways": [
            {"text": "Undo in a text editor is a stack; a printer job list is a queue.", "source_ids": src(6)},
            {"text": "Next week: implementing stacks and queues with arrays and linked lists.", "source_ids": src(7)},
        ],
        "exam_hints": [
            {"text": "Know the difference between a stack (LIFO) and a queue (FIFO). The lecturer said this will be on the exam.", "source_ids": src(5)},
        ],
    }


def quiz() -> list[dict]:
    return [
        {"question": "What does LIFO stand for, and which structure uses it?", "expected_answer": "Last in, first out. A stack uses it."},
        {"question": "Which operation adds an element to a queue?", "expected_answer": "Enqueue, which adds at the rear."},
        {"question": "Give one real-world example of a stack.", "expected_answer": "The undo button in a text editor."},
    ]


def grade(expected: str) -> dict:
    return {"heard": "(demo mode: answer received)", "correct": True, "feedback": f"Correct! {expected}"}


def _first_ids(note: dict, n: int = 2) -> list[int]:
    return [s["id"] for s in note["segments"][:n]]


def material_links(note: dict) -> dict:
    return {
        "summary": "Lecture slides on stacks and queues with diagrams and code examples.",
        "links": [
            {"point": "The slides show the same LIFO stack diagram the lecturer described.", "source_ids": _first_ids(note)},
            {"point": "The slides list push and pop with array code, matching the lecture.", "source_ids": _first_ids(note, 3)[-1:]},
        ],
        "extra": ["The slides add a third stack operation, peek, which reads the top without removing it."],
    }


def flashcards(note: dict) -> list[dict]:
    ids = _first_ids(note, 8)
    pick = lambda i: ids[i : i + 1]  # noqa: E731
    return [
        {"front": "What does LIFO mean?", "back": "Last in, first out: the last element added is removed first.", "source": "lecture", "source_ids": pick(1)},
        {"front": "Which structure uses FIFO?", "back": "A queue: first in, first out.", "source": "lecture", "source_ids": pick(3)},
        {"front": "What does push do?", "back": "Adds an element to the top of a stack.", "source": "lecture", "source_ids": pick(2)},
        {"front": "What does dequeue do?", "back": "Removes the element at the front of a queue.", "source": "lecture", "source_ids": pick(4)},
        {"front": "Real-world stack example?", "back": "The undo button in a text editor.", "source": "lecture", "source_ids": pick(6)},
        {"front": "Stack vs queue (exam!)", "back": "A stack removes the newest item (LIFO); a queue removes the oldest (FIFO).", "source": "lecture", "source_ids": pick(5)},
    ]


def study_plan(days: int, minutes: int) -> dict:
    topics = ["Stacks: LIFO, push and pop", "Queues: FIFO, enqueue and dequeue", "Stack vs queue (exam hint)", "Real examples and implementation"]
    plan = []
    for d in range(1, days + 1):
        last = d == days
        plan.append(
            {
                "day": d,
                "focus": "Full review" if last else topics[(d - 1) % len(topics)],
                "minutes": minutes,
                "tasks": (
                    ["Listen to the notes", "Flashcards: all cards", "Voice quiz"]
                    if last
                    else ["Listen to the notes", "Flashcards", "Ask the tutor one question about today's topic"]
                ),
            }
        )
    return {"goal": "Explain stacks and queues and their difference confidently in the exam.", "days": plan}


def chat(question: str) -> dict:
    return {
        "heard": question or "(demo mode: spoken question)",
        "answer": "A stack is like a pile of plates: you take the last plate you put on top. That is LIFO, last in, first out. A queue is like a line at a shop: the first person in line is served first.",
        "source_ids": [],
        "materials": [],
    }
