import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

ADDIS_API_KEY = os.getenv("ADDIS_API_KEY", "").strip()
ADDIS_BASE = os.getenv("ADDIS_BASE", "https://api.addisassistant.com").rstrip("/")
# First language tried for each lecture chunk (en / am / om). Empty chunks then try the others.
ADDIS_STT_LANG = os.getenv("ADDIS_STT_LANG", "en").strip() or "en"
ADDIS_TIMEOUT = float(os.getenv("ADDIS_TIMEOUT", "60"))
# Gemini is the fallback when Addis is down, unpaid, or rate-limited.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
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
DEMO_MODE = os.getenv("DEMO_MODE", "0").lower() in {"1", "true", "yes"} or not (ADDIS_API_KEY or GEMINI_API_KEY)
# Bumped on each deploy so we can tell if Render is serving the latest image.
BUILD_ID = os.getenv("BUILD_ID", "2026-11-21b").strip()
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "lissannote.db")))
# Built Vite app (production). Empty in local `npm run dev` (Vite proxies /api).
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))

LANGS = {"en": "English", "am": "Amharic", "om": "Afaan Oromo"}
