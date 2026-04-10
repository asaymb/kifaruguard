import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://kifaru:kifaru123@localhost:5432/kifaru_guard")

# No in-code defaults for cryptographic secrets — application startup fails if unset (see main.py).
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
AUDIT_HMAC_SECRET = os.getenv("AUDIT_HMAC_SECRET", "").strip()

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "tinyllama")


def get_cors_origins_and_credentials() -> tuple[list[str], bool]:
    """Explicit ALLOWED_ORIGINS list only — never use wildcard with credentials (browser + OWASP)."""
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return [], False
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins, True
