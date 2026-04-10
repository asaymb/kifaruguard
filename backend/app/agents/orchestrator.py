from backend.app.agents.bank_agent import run_bank_agent
from backend.app.agents.guardrails import apply_guardrail
from backend.app.agents.mine_agent import run_mine_agent
import logging

runtime_logger = logging.getLogger(__name__)

def run_state_machine(agent_type: str, text: str, sanctions_mines_csv: str, sanctions_bank_csv: str, logger):
    runtime_logger.info("Agent run started: %s", agent_type)
    logger(agent_type, "START", "request", "starting", "ok")
    logger(agent_type, "PARSE_DOCUMENT", text[:1000], "parsed", "ok")
    result = run_mine_agent(text, sanctions_mines_csv) if agent_type == "mine" else run_bank_agent(text, sanctions_bank_csv)
    logger(agent_type, "EXTRACT_DATA", text[:1000], str(result), "ok")
    guard = apply_guardrail(result["status"])
    logger(agent_type, "CHECK_RULES", result["status"], str(guard), "ok")
    if not guard["allowed"]:
        result["status"] = "BLOCKED"
    elif guard.get("action") == "REVIEW":
        result["status"] = "REVIEW"
    logger(agent_type, "DECISION", str(guard), str(result), "ok")
    logger(agent_type, "END", str(result), "done", "ok")
    runtime_logger.info("Agent run finished: %s -> %s", agent_type, result.get("status"))
    return result
