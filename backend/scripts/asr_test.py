"""Hour-zero check: how well does Gemini transcribe your mixed-language lecture clips?

Usage (from the backend folder):
    python scripts/asr_test.py clip1.wav clip2.mp3 ...

If a .txt file with the same name sits next to a clip (clip1.txt), it is treated as the
reference script and a rough word-match score is printed.
"""

import asyncio
import difflib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import ai, config  # noqa: E402

MIME = {
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
    ".m4a": "audio/aac",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
    ".aiff": "audio/aiff",
}


def word_match(reference: str, heard: str) -> float:
    ref, hyp = reference.lower().split(), heard.lower().split()
    if not ref:
        return 0.0
    matcher = difflib.SequenceMatcher(None, ref, hyp)
    return sum(b.size for b in matcher.get_matching_blocks()) / len(ref)


async def main(paths: list[str]) -> None:
    if config.DEMO_MODE:
        sys.exit("No ADDIS_API_KEY in backend/.env (or DEMO_MODE=1). Add a key to run the real test.")
    for p in map(Path, paths):
        mime = MIME.get(p.suffix.lower())
        if mime is None:
            print(f"skip {p}: unsupported type {p.suffix}")
            continue
        start = time.perf_counter()
        result = await ai.transcribe(p.read_bytes(), mime)
        took = time.perf_counter() - start
        print(f"\n=== {p.name}  ({took:.1f}s, languages: {', '.join(result['languages']) or 'none'})")
        print(result["text"])
        ref = p.with_suffix(".txt")
        if ref.exists():
            print(f"--> word match vs {ref.name}: {word_match(ref.read_text(encoding='utf-8'), result['text']):.0%}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1:]))
