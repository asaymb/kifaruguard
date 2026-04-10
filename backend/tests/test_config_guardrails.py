import backend.app.core.runtime_config as runtime_config
from backend.app.api.deps import get_current_user
from backend.app.main import app
from fastapi.testclient import TestClient


class _FakeUser:
    username = "admin"
    id = 1


def test_get_guardrails_requires_auth():
    with TestClient(app) as c:
        r = c.get("/config/guardrails")
        assert r.status_code == 401


def test_guardrails_roundtrip(monkeypatch, tmp_path):
    cfg_file = tmp_path / "runtime.yaml"
    cfg_file.write_text("agents:\n  mine: true\n  bank: true\n", encoding="utf-8")
    monkeypatch.setattr(runtime_config, "RUNTIME_CONFIG_PATH", str(cfg_file))

    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    try:
        with TestClient(app) as c:
            r = c.get("/config/guardrails")
            assert r.status_code == 200
            body = r.json()
            assert "rules" in body
            assert "block_on_status" in body

            payload = {
                "rules": [
                    {"enabled": True, "condition": "OK", "action": "REVIEW", "message": "Check this"},
                    {"enabled": False, "condition": "BLOCKED", "action": "BLOCK", "message": ""},
                ]
            }
            r2 = c.post("/config/guardrails", json=payload)
            assert r2.status_code == 200
            saved = r2.json()["guardrails"]["rules"]
            assert len(saved) == 2
            assert saved[0]["condition"] == "OK"
            assert saved[0]["action"] == "REVIEW"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_guardrails_post_validation():
    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    try:
        with TestClient(app) as c:
            r = c.post("/config/guardrails", json={"rules": [{"enabled": True, "condition": "", "action": "BLOCK"}]})
            assert r.status_code == 422
            r2 = c.post("/config/guardrails", json={})
            assert r2.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)
