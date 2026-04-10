"""
Couche LLM : Ollama (dev / Docker), puis OpenAI, puis repli structuré (mode fallback).

La logique métier utilise `generate()` qui retourne texte + mode pour traçabilité.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

import requests

from backend.app.core.config import get_settings
from backend.app.core.runtime_config import load_runtime_config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMGenerateResult:
    """Réponse LLM + fournisseur effectif (audit / conformité)."""

    text: str
    mode: str  # ollama | openai | fallback


def _valid(text: str | None) -> bool:
    return isinstance(text, str) and len(text.strip()) >= 10


class OllamaProvider:
    """Appel HTTP vers l'API generate d'Ollama."""

    def try_generate(self, prompt: str, llm_cfg: dict) -> str | None:
        s = get_settings()
        local = llm_cfg.get("local", {})
        url = (local.get("url") or f"{s.ollama_url}/api/generate").strip()
        model = local.get("model") or s.ollama_model
        timeout = int(local.get("timeout_seconds", 5))
        retries = max(1, int(local.get("retries", 2)))

        logger.info("llm_ollama model=%s url=%s", model, url)
        for _ in range(retries):
            try:
                r = requests.post(url, json={"model": model, "prompt": prompt, "stream": False}, timeout=timeout)
                if r.status_code == 404:
                    logger.error("llm_ollama model missing model=%s — ollama pull %s", model, model)
                    return None
                r.raise_for_status()
                body = r.json() or {}
                if body.get("error"):
                    logger.error("llm_ollama error: %s", body.get("error"))
                    return None
                text = (body.get("response") or "").strip()
                if _valid(text):
                    return text
            except Exception:
                logger.debug("llm_ollama attempt failed", exc_info=True)
        return None


class OpenAIProvider:
    """API OpenAI (chat completions)."""

    def try_generate(self, prompt: str, llm_cfg: dict) -> str | None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return None
        openai_cfg = llm_cfg.get("openai", {})
        model = openai_cfg.get("model", "gpt-4o-mini")
        timeout = int(openai_cfg.get("timeout_seconds", 5))

        logger.info("llm_openai model=%s", model)
        try:
            r = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                },
                timeout=timeout,
            )
            r.raise_for_status()
            data = r.json() or {}
            choices = data.get("choices") or []
            if choices and isinstance(choices, list):
                content = choices[0].get("message", {}).get("content", "")
                if _valid(content):
                    return content.strip()
        except Exception:
            logger.exception("llm_openai_failed")
        return None


class FallbackProvider:
    """Aucun LLM disponible — sortie structurée explicite (pas de phrase vague seule)."""

    STRUCTURED = {
        "status": "REVIEW",
        "reason": "LLM unavailable, requires manual validation",
        "confidence": 0.15,
        "requires_human_review": True,
    }

    def respond(self) -> str:
        logger.info("llm_fallback structured_review")
        return json.dumps(self.STRUCTURED, ensure_ascii=False)


def generate(prompt: str) -> LLMGenerateResult:
    cfg = load_runtime_config().get("llm", {})
    settings = get_settings()

    if settings.ollama_enabled:
        text = OllamaProvider().try_generate(prompt, cfg)
        if text:
            return LLMGenerateResult(text=text, mode="ollama")
        logger.warning("llm_ollama_unavailable trying next provider")

    text = OpenAIProvider().try_generate(prompt, cfg)
    if text:
        return LLMGenerateResult(text=text, mode="openai")

    return LLMGenerateResult(text=FallbackProvider().respond(), mode="fallback")
