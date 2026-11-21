import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
# Tried in order when the main model is overloaded, rate-limited or times out.
GEMINI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv(
        "GEMINI_FALLBACK_MODELS",
        "gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite-preview,"
        "gemini-3.8-flash,gemini-3.5-flash,gemini-3.1-flash-lite",
    ).split(",")
    if m.strip()
]
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "45"))
DEMO_MODE = os.getenv("DEMO_MODE", "0").lower() in {"1", "true", "yes"} or not GEMINI_API_KEY
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "lissannote.db")))

LANGS = {"en": "English", "am": "Amharic", "om": "Afaan Oromo"}
