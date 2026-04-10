import logging

from backend.app.agents.bank_agent import run_bank_agent
from backend.app.agents.decision import attach_normalized_fields, guardrails_triggered_list
from backend.app.agents.guardrails import apply_guardrail
from backend.app.agents.mine_agent import run_mine_agent
from backend.app.core.business_logging import log_run_event

runtime_logger = logging.getLogger(__name__)


def run_state_machine(
    agent_type: str,
    text: str,
    sanctions_mines_csv: str,
    sanctions_bank_csv: str,
    logger,
    *,
    run_id: str,
):
    runtime_logger.info("Agent run started: %s run_id=%s", agent_type, run_id)
    logger(agent_type, "START", "request", "starting", "ok")
    logger(agent_type, "PARSE_DOCUMENT", text[:1000], "parsed", "ok")
    result = run_mine_agent(text, sanctions_mines_csv) if agent_type == "mine" else run_bank_agent(text, sanctions_bank_csv)
    logger(agent_type, "EXTRACT_DATA", text[:1000], str(result), "ok")

    pre_guard_status = result["status"]
    guard = apply_guardrail(pre_guard_status)
    logger(agent_type, "CHECK_RULES", pre_guard_status, str(guard), "ok")

    if not guard["allowed"]:
        result["status"] = "BLOCKED"
    elif guard.get("action") == "REVIEW":
        result["status"] = "REVIEW"

    logger(agent_type, "DECISION", str(guard), str(result), "ok")

    llm_mode_used = str(result.get("llm_mode") or "none")
    if result.get("llm_fallback"):
        llm_mode_used = "fallback"

    triggers = guardrails_triggered_list(guard, pre_guard_status)
    attach_normalized_fields(result, guard=guard, agent_type=agent_type, pre_guard_status=pre_guard_status)

    result["llm_mode_used"] = llm_mode_used

    logger(agent_type, "END", str(result), "done", "ok")

    log_run_event(
        run_id=run_id,
        status=result["status"],
        decision_reason=result.get("reason") or "",
        llm_mode_used=llm_mode_used,
        guardrails_triggered=triggers,
        requires_human_review=bool(result.get("requires_human_review")),
        agent_type=agent_type,
        extra={"confidence": result.get("confidence"), "audit_integrity": "hmac_per_line_plus_chain"},
    )

    runtime_logger.info("Agent run finished: %s -> %s run_id=%s", agent_type, result.get("status"), run_id)
    return result
