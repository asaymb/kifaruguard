"""Compatibilité : exposition de `generate` et du type de résultat."""
from backend.app.core.llm_service import LLMGenerateResult, generate

__all__ = ["generate", "LLMGenerateResult"]
