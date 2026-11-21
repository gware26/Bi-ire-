import sqlite3
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY,
    course_name TEXT NOT NULL UNIQUE,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    notebook_id INTEGER NOT NULL REFERENCES notebooks(id),
    started_at REAL NOT NULL,
    ended_at REAL,
    status TEXT NOT NULL DEFAULT 'recording'
);
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    seq INTEGER NOT NULL,
    start_sec REAL NOT NULL,
    end_sec REAL NOT NULL,
    langs TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    at_sec REAL NOT NULL,
    trigger_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL UNIQUE REFERENCES sessions(id),
    out_lang TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    definitions TEXT NOT NULL,
    takeaways TEXT NOT NULL,
    exam_hints TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id),
    question TEXT NOT NULL,
    expected TEXT NOT NULL,
    spoken_answer TEXT,
    correct INTEGER,
    feedback TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id),
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    analysis TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS study_items (
    note_id INTEGER NOT NULL REFERENCES notes(id),
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at REAL NOT NULL,
    PRIMARY KEY (note_id, kind)
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id),
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    sources TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with db() as conn:
        conn.executescript(SCHEMA)
