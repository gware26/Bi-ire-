import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
DEMO_MODE = os.getenv("DEMO_MODE", "0").lower() in {"1", "true", "yes"} or not GEMINI_API_KEY
DB_PATH = Path(os.getenv("DB_PATH", str(BASE_DIR / "lissannote.db")))

LANGS = {"en": "English", "am": "Amharic", "om": "Afaan Oromo"}
