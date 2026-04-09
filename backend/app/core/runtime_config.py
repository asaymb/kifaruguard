import os
from typing import Any

import yaml

RUNTIME_CONFIG_PATH = os.getenv("RUNTIME_CONFIG_PATH", "/app/config/runtime.yaml")

DEFAULT_CONFIG = {
    "agents": {"mine": True, "bank": True},
    "guardrails": {"block_on_status": ["BLOCKED"]},
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
    try:
        if os.path.exists(RUNTIME_CONFIG_PATH):
            with open(RUNTIME_CONFIG_PATH, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f) or {}
            if isinstance(raw, dict):
                config = _deep_merge(config, raw)
    except Exception:
        pass
    return config


def save_runtime_config(config: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(RUNTIME_CONFIG_PATH), exist_ok=True)
    with open(RUNTIME_CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, sort_keys=False)


def is_agent_enabled(agent_type: str) -> bool:
    return bool(load_runtime_config().get("agents", {}).get(agent_type, True))


def get_block_statuses() -> set[str]:
    statuses = load_runtime_config().get("guardrails", {}).get("block_on_status", ["BLOCKED"])
    if not isinstance(statuses, list):
        return {"BLOCKED"}
    return {str(s).upper() for s in statuses}
