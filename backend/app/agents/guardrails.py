from backend.app.core.runtime_config import get_block_statuses


def apply_guardrail(status: str) -> dict:
    if str(status).upper() in get_block_statuses():
        return {"allowed": False, "action": "BLOCK"}
    return {"allowed": True, "action": "ALLOW"}
