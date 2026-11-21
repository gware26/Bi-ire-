"""Runs the full flow against a running backend: session, chunks, bookmark, notes, quiz.

Usage (backend running on :8000):  python scripts/smoke_test.py
Works in demo mode; with a real key it sends silent audio, so expect empty transcripts.
"""

import io
import sys
import wave

import httpx

BASE = "http://127.0.0.1:8000/api"


def silent_wav(seconds: float = 1.0, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


def main() -> None:
    c = httpx.Client(base_url=BASE, timeout=120)
    print("health:", c.get("/health").json())
    sid = c.post("/sessions", json={"course_name": "Smoke Test"}).json()["session_id"]
    for seq in range(8):
        r = c.post(
            f"/sessions/{sid}/chunks",
            files={"audio": ("c.wav", silent_wav(), "audio/wav")},
            data={"seq": seq, "start_sec": seq * 10, "end_sec": seq * 10 + 10},
        )
        r.raise_for_status()
        seg = r.json()["segment"]
        print(f"chunk {seq}:", seg["text"][:70] if seg else "(no speech)")
    c.post(f"/sessions/{sid}/bookmarks", json={"at_sec": 55, "trigger_type": "voice"}).raise_for_status()
    r = c.post(f"/sessions/{sid}/end", json={"out_lang": "en"})
    if r.status_code != 200:
        sys.exit(f"end failed: {r.status_code} {r.text}")
    note = r.json()
    print("notes:", note["title"], "|", len(note["definitions"]), "definitions,", len(note["exam_hints"]), "exam hints")
    quiz = c.post(f"/notes/{note['id']}/quiz").json()
    print("quiz:", [q["question"] for q in quiz["questions"]])
    ans = c.post(
        f"/quiz-attempts/{quiz['questions'][0]['id']}/answer",
        files={"audio": ("a.wav", silent_wav(), "audio/wav")},
    ).json()
    print("answer:", ans)
    print("OK")


if __name__ == "__main__":
    main()
