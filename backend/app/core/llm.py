import logging
import os

import requests

from backend.app.core.runtime_config import load_runtime_config

logger = logging.getLogger(__name__)


def _is_valid_response(text: str) -> bool:
    return isinstance(text, str) and len(text.strip()) >= 10


def _call_local(prompt: str, llm_cfg: dict) -> str | None:
    local = llm_cfg.get("local", {})
    url = local.get("url", "http://ollama:11434/api/generate")
    model = local.get("model", "tinyllama")
    timeout = int(local.get("timeout_seconds", 5))
    retries = max(1, int(local.get("retries", 2)))

    logger.info("Using local LLM")
    for _ in range(retries):
        try:
            response = requests.post(url, json={"model": model, "prompt": prompt, "stream": False}, timeout=timeout)
            response.raise_for_status()
            text = (response.json() or {}).get("response", "")
            if _is_valid_response(text):
                return text.strip()
        except Exception:
            continue
    return None


def _call_openai(prompt: str, llm_cfg: dict) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    openai_cfg = llm_cfg.get("openai", {})
    model = openai_cfg.get("model", "gpt-4o-mini")
    timeout = int(openai_cfg.get("timeout_seconds", 5))

    logger.info("Falling back to OpenAI")
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
            },
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json() or {}
        choices = data.get("choices", [])
        if choices and isinstance(choices, list):
            content = choices[0].get("message", {}).get("content", "")
            if _is_valid_response(content):
                return content.strip()
    except Exception:
        return None
    return None


def generate(prompt: str) -> str:
    cfg = load_runtime_config().get("llm", {})

    text = _call_local(prompt, cfg)
    if text:
        return text

    text = _call_openai(prompt, cfg)
    if text:
        return text

    logger.info("Using mock fallback")
    return "Unable to process request safely"
