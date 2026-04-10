"""
Configuration centralisée (variables d'environnement uniquement).

Règles :
- ENVIRONMENT=production  → pas d'Ollama par défaut ; DATABASE_URL obligatoire.
- ENVIRONMENT=development → Ollama activé par défaut ; DATABASE_URL a une valeur par défaut locale.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


def _resolve_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    if env == "production" and not url:
        raise RuntimeError("DATABASE_URL doit être défini lorsque ENVIRONMENT=production")
    if url:
        return url
    return "postgresql+psycopg2://kifaru:kifaru123@localhost:5432/kifaru_guard"


# Import session/engine avant toute autre lecture — échoue tôt si prod sans DATABASE_URL
DATABASE_URL = _resolve_database_url()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
AUDIT_HMAC_SECRET = os.getenv("AUDIT_HMAC_SECRET", "").strip()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720

# Chemins sanctions (Docker : /app/data/... ; surcharge possible en local)
SANCTIONS_MINES_CSV = os.getenv("SANCTIONS_MINES_CSV", "/app/data/sanctions_mines.csv")
SANCTIONS_BANK_CSV = os.getenv("SANCTIONS_BANK_CSV", "/app/data/sanctions_politiques.csv")

# Ollama (utilisé seulement si ollama_enabled — voir Settings)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "tinyllama")


@dataclass(frozen=True)
class Settings:
    environment: str
    is_production: bool
    database_url: str
    ollama_enabled: bool
    ollama_url: str
    ollama_model: str
    openai_configured: bool
    runtime_config_path: str


@lru_cache
def get_settings() -> Settings:
    env = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"
    is_prod = env == "production"
    ollama_default = not is_prod
    ollama_enabled = _env_bool("OLLAMA_ENABLED", ollama_default)
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    return Settings(
        environment=env,
        is_production=is_prod,
        database_url=DATABASE_URL,
        ollama_enabled=ollama_enabled,
        ollama_url=OLLAMA_URL,
        ollama_model=OLLAMA_MODEL,
        openai_configured=bool(openai_key),
        runtime_config_path=os.getenv("RUNTIME_CONFIG_PATH", "/app/config/runtime.yaml").strip()
        or "/app/config/runtime.yaml",
    )


def get_cors_origins_and_credentials() -> tuple[list[str], bool]:
    """Liste ALLOWED_ORIGINS explicite — jamais de * avec credentials."""
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return [], False
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins, True


def describe_llm_mode() -> str:
    """Libellé court pour les logs au démarrage."""
    s = get_settings()
    if s.ollama_enabled:
        return f"ollama (url={s.ollama_url}, model={s.ollama_model})"
    if s.openai_configured:
        return "openai (ollama désactivé en production ou via OLLAMA_ENABLED=0)"
    return "fallback statique (aucune clé OpenAI ; ollama désactivé)"


def health_llm_tier() -> str:
    """Valeur exposée par /health : chemin LLM prévu (pas un test live des API externes)."""
    s = get_settings()
    if s.ollama_enabled:
        return "ollama"
    if s.openai_configured:
        return "openai"
    return "fallback"
