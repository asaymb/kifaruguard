from backend.app.core.runtime_config import get_block_statuses, load_runtime_config


def apply_guardrail(status: str) -> dict:
    """
    Match agent outcome status against policy rules (simple exact match, case-insensitive).
    Falls back to block_on_status if rules list is empty or missing.
    """
    cfg = load_runtime_config().get("guardrails", {})
    rules = cfg.get("rules")
    status_u = str(status).strip().upper()

    if isinstance(rules, list) and len(rules) > 0:
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            if not rule.get("enabled", True):
                continue
            cond = str(rule.get("condition", "")).strip().upper()
            if not cond or cond != status_u:
                continue
            act = str(rule.get("action", "BLOCK")).upper()
            msg = str(rule.get("message", "") or "").strip()
            if act == "BLOCK":
                return {"allowed": False, "action": "BLOCK", "message": msg}
            if act == "REVIEW":
                return {"allowed": True, "action": "REVIEW", "message": msg}
        return {"allowed": True, "action": "ALLOW", "message": ""}

    if status_u in get_block_statuses():
        return {"allowed": False, "action": "BLOCK", "message": ""}
    return {"allowed": True, "action": "ALLOW", "message": ""}
