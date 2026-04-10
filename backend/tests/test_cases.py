import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app.api.deps import get_current_user
from backend.app.main import app
from backend.app.db.models import AuditLog, Base
from backend.app.db.session import SessionLocal, engine


class _FakeUser:
    username = "admin"
    id = 1


@pytest.fixture
def client_auth():
    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


def test_cases_requires_auth():
    with TestClient(app) as c:
        r = c.get(f"/cases/{uuid.uuid4()}")
        assert r.status_code == 401


def test_cases_404(client_auth):
    r = client_auth.get(f"/cases/{uuid.uuid4()}")
    assert r.status_code == 404


def test_cases_returns_payload(client_auth):
    rid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        db.add(
            AuditLog(
                agent_type="bank",
                step="END",
                timestamp=datetime.utcnow(),
                input_text=str({"status": "REVIEW", "data": {"company_name": "Acme"}}),
                output_text="done | sig=x",
                status="ok",
                run_id=rid,
            )
        )
        db.commit()
    finally:
        db.close()

    r = client_auth.get(f"/cases/{rid}")
    assert r.status_code == 200
    body = r.json()
    assert body["run_id"] == rid
    assert body["agent_type"] == "bank"
    assert body["summary"]["final_status"] == "REVIEW"
    assert body["extracted_data"]["company_name"] == "Acme"
    assert len(body["audit_logs"]) == 1
    assert body["hitl"] is None
