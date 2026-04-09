from backend.app.agents.guardrails import apply_guardrail


def test_guardrail_blocks_blocked_status():
    result = apply_guardrail("BLOCKED")
    assert result["allowed"] is False
    assert result["action"] == "BLOCK"


def test_guardrail_allows_ok_status():
    result = apply_guardrail("OK")
    assert result["allowed"] is True
    assert result["action"] == "ALLOW"
