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


def notes(segments: list[dict]) -> dict:
    ids = [s["id"] for s in segments]

    def src(*positions: int) -> list[int]:
        return [ids[p] for p in positions if p < len(ids)]

    return {
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
