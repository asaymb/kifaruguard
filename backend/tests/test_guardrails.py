import pytest

from backend.app.agents.guardrails import apply_guardrail
from backend.app.core.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_guardrails_yaml(monkeypatch, tmp_path):
    """Deterministic rules — do not depend on repo config/runtime.yaml or other tests."""
    cfg = tmp_path / "guardrails_only.yaml"
    cfg.write_text(
        "guardrails:\n"
        "  block_on_status:\n"
        "    - BLOCKED\n"
        "  rules:\n"
        "    - enabled: true\n"
        "      condition: BLOCKED\n"
        "      action: BLOCK\n"
        "      message: ''\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("RUNTIME_CONFIG_PATH", str(cfg))
    get_settings.cache_clear()


def test_guardrail_blocks_blocked_status():
    result = apply_guardrail("BLOCKED")
    assert result["allowed"] is False
    assert result["action"] == "BLOCK"


def test_guardrail_allows_ok_status():
    result = apply_guardrail("OK")
    assert result["allowed"] is True
    assert result["action"] == "ALLOW"
