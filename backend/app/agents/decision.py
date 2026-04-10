"""
Normalisation des décisions agent pour l'API et les logs métier.
"""
from __future__ import annotations

from typing import Any


def map_public_status(status: str) -> str:
    """APPROVED (legacy banque) → OK ; reste BLOCKED / REVIEW / OK."""
    u = str(status or "").strip().upper()
    if u == "APPROVED":
        return "OK"
    if u in ("OK", "BLOCKED", "REVIEW"):
        return u
    return "REVIEW"


def build_decision_reason(
    *,
    final_status: str,
    guard: dict[str, Any],
    agent_type: str,
    llm_mode: str,
    llm_fallback: bool,
) -> str:
    if llm_fallback:
        return "LLM unavailable, requires manual validation"
    if not guard.get("allowed", True):
        return (guard.get("message") or "").strip() or "Outcome blocked by active guardrail policy."
    if str(guard.get("action", "")).upper() == "REVIEW":
        return (guard.get("message") or "").strip() or "Policy requires human review before proceeding."
    if final_status == "REVIEW":
        return (
            "Potential sanctions match or elevated risk — queued for human review."
            if agent_type == "bank"
            else "Outcome requires review under current rules."
        )
    if final_status == "BLOCKED":
        return "Document or extracted data matches a blocked sanctions condition."
    return "Automated checks passed; no blocking guardrail triggered."


def compute_confidence(
    *,
    public_status: str,
    llm_mode: str,
    llm_fallback: bool,
) -> float:
    if llm_fallback:
        return 0.15
    if public_status == "BLOCKED":
        return 0.88
    if public_status == "REVIEW":
        return 0.42
    if llm_mode in ("ollama", "openai"):
        return 0.72
    return 0.82


def guardrails_triggered_list(guard: dict[str, Any], pre_guard_status: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not guard.get("allowed", True):
        out.append(
            {
                "rule_effect": "BLOCK",
                "matched_status": str(pre_guard_status).upper(),
                "message": (guard.get("message") or "").strip(),
            }
        )
    elif str(guard.get("action", "")).upper() == "REVIEW":
        out.append(
            {
                "rule_effect": "REVIEW",
                "matched_status": str(pre_guard_status).upper(),
                "message": (guard.get("message") or "").strip(),
            }
        )
    return out


def resolve_public_status(
    *,
    pre_guard_status: str,
    guard: dict[str, Any],
    llm_fallback: bool,
) -> str:
    """Statut final OK | BLOCKED | REVIEW après règles métier + garde-fous."""
    agent_terminal = map_public_status(pre_guard_status)
    if not guard.get("allowed", True):
        return "BLOCKED"
    if str(guard.get("action", "")).upper() == "REVIEW":
        return "REVIEW"
    if llm_fallback:
        return "REVIEW"
    return agent_terminal


def attach_normalized_fields(
    result: dict[str, Any],
    *,
    guard: dict[str, Any],
    agent_type: str,
    pre_guard_status: str,
) -> dict[str, Any]:
    """Enrichit le dict résultat (mutation) avec reason, confidence, requires_human_review, status public."""
    llm_mode = str(result.get("llm_mode") or "none")
    llm_fallback = bool(result.get("llm_fallback"))
    public_status = resolve_public_status(
        pre_guard_status=pre_guard_status,
        guard=guard,
        llm_fallback=llm_fallback,
    )

    result["status"] = public_status
    result["reason"] = build_decision_reason(
        final_status=public_status,
        guard=guard,
        agent_type=agent_type,
        llm_mode=llm_mode,
        llm_fallback=llm_fallback,
    )
    result["confidence"] = round(
        compute_confidence(public_status=public_status, llm_mode=llm_mode, llm_fallback=llm_fallback),
        2,
    )
    result["requires_human_review"] = public_status == "REVIEW"
    # Champs internes non exposés au client final (optionnel — laissés pour debug léger)
    for k in ("llm_mode", "llm_fallback", "_pre_guard_status"):
        result.pop(k, None)
    return result
