import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

ADDIS_API_KEY = os.getenv("ADDIS_API_KEY", "").strip()
ADDIS_BASE = os.getenv("ADDIS_BASE", "https://api.addisassistant.com").rstrip("/")
# Scribe languages for each lecture chunk: en English, am Amharic, om Afaan Oromo.
_STT_CODES = {"en", "am", "om"}
ADDIS_STT_LANGS = [
    code
    for code in (part.strip() for part in os.getenv("ADDIS_STT_LANG", "en,am,om").split(","))
    if code in _STT_CODES
] or ["en"]
ADDIS_STT_LANG = ADDIS_STT_LANGS[0]
ADDIS_TIMEOUT = float(os.getenv("ADDIS_TIMEOUT", "60"))
DEMO_MODE = os.getenv("DEMO_MODE", "0").lower() in {"1", "true", "yes"} or not ADDIS_API_KEY
# Bumped on each deploy so we can tell if Render is serving the latest image.
BUILD_ID = os.getenv("BUILD_ID", "2026-11-22b").strip()
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "lissannote.db")))
# Built Vite app (production). Empty in local `npm run dev` (Vite proxies /api).
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist")))

LANGS = {"en": "English", "am": "Amharic", "om": "Afaan Oromo"}
