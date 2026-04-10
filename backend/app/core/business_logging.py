"""
Logs métier structurés (JSON) pour conformité et supervision sans lire le code applicatif.
Logger dédié : kifaru.business
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

_logger = logging.getLogger("kifaru.business")


def log_run_event(
    *,
    run_id: str,
    status: str,
    decision_reason: str,
    llm_mode_used: str,
    guardrails_triggered: list[dict[str, Any]],
    requires_human_review: bool,
    agent_type: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload = {
        "event": "agent_run",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "run_id": run_id,
        "status": status,
        "decision_reason": decision_reason,
        "llm_mode_used": llm_mode_used,
        "guardrails_triggered": guardrails_triggered,
        "requires_human_review": requires_human_review,
    }
    if agent_type:
        payload["agent_type"] = agent_type
    if extra:
        payload["extra"] = extra
    _logger.info(json.dumps(payload, ensure_ascii=False))
