import os

from dotenv import load_dotenv
from openai import AsyncOpenAI
from sarvamai import AsyncSarvamAI

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Must be the secret / service_role key: the backend enforces access itself and
# needs to read across nurses (e.g. to hand a patient over). Never expose this
# to the client. SUPABASE_KEY is accepted as the older name.
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_KEY")

_REQUIRED = {
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_SECRET_KEY": SUPABASE_KEY,
}
_missing = [name for name, value in _REQUIRED.items() if not value]
if _missing:
    raise RuntimeError(
        "Missing required environment variables: "
        + ", ".join(_missing)
        + ". Set them in backend/.env (see .env.example)."
    )

# A publishable key here fails deep inside a request as "permission denied",
# which reads like "this nurse has no patients". Refuse to start instead.
if SUPABASE_KEY.startswith("sb_publishable") or '"role":"anon"' in SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_SECRET_KEY looks like a publishable/anon key. The backend needs "
        "the secret (service_role) key from Supabase > Project Settings > API. "
        "The publishable key belongs in frontend/.env instead."
    )

# Voice and AI are conveniences, not dependencies: a missing key disables those
# features (the routes answer 503 or fall back) but the app still starts, and a
# nurse can always type. Async clients only, for the reason given in services/db.py.
AI_TIMEOUT_SECONDS = 30.0

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")

# Groq is OpenAI-compatible, so we reuse the openai client
groq_client = (
    AsyncOpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=GROQ_API_KEY,
        timeout=AI_TIMEOUT_SECONDS,
        max_retries=1,
    )
    if GROQ_API_KEY
    else None
)
sarvam_client = (
    AsyncSarvamAI(api_subscription_key=SARVAM_API_KEY, timeout=AI_TIMEOUT_SECONDS)
    if SARVAM_API_KEY
    else None
)

# transcription confidence below this asks the nurse to check more carefully
REVIEW_CONFIDENCE_THRESHOLD = 0.75

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:1420,http://localhost:5173,tauri://localhost",
    ).split(",")
    if origin.strip()
]
