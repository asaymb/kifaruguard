import os
from typing import Any

import yaml

from backend.app.core.config import get_settings


def _runtime_config_path() -> str:
    return get_settings().runtime_config_path

DEFAULT_CONFIG = {
    "agents": {"mine": True, "bank": True},
    "guardrails": {
        "block_on_status": ["BLOCKED"],
        "rules": [
            {
                "enabled": True,
                "condition": "BLOCKED",
                "action": "BLOCK",
                "message": "This outcome is blocked by policy.",
            },
        ],
    },
    "llm": {
        "local": {
            "url": "http://ollama:11434/api/generate",
            "model": "tinyllama",
            "timeout_seconds": 5,
            "retries": 2,
        },
        "openai": {"model": "gpt-4o-mini", "timeout_seconds": 5},
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_runtime_config() -> dict[str, Any]:
    config = dict(DEFAULT_CONFIG)
    path = _runtime_config_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f) or {}
            if isinstance(raw, dict):
                config = _deep_merge(config, raw)
    except Exception:
        pass
    return config


def save_runtime_config(config: dict[str, Any]) -> None:
    path = _runtime_config_path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, sort_keys=False)


def is_agent_enabled(agent_type: str) -> bool:
    return bool(load_runtime_config().get("agents", {}).get(agent_type, True))


def get_block_statuses() -> set[str]:
    statuses = load_runtime_config().get("guardrails", {}).get("block_on_status", ["BLOCKED"])
    if not isinstance(statuses, list):
        return {"BLOCKED"}
    return {str(s).upper() for s in statuses}


def derive_block_on_status_from_rules(rules: list[Any]) -> list[str]:
    """Statuses that trigger a BLOCK action (kept in sync for audit PDF / legacy readers)."""
    seen: list[str] = []
    for r in rules:
        if not isinstance(r, dict):
            continue
        if not r.get("enabled", True):
            continue
        if str(r.get("action", "")).upper() != "BLOCK":
            continue
        c = str(r.get("condition", "")).strip().upper()
        if c and c not in seen:
            seen.append(c)
    return seen
