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
    """Bypass JWT for DB-focused export tests (avoids bcrypt/passlib edge cases during conftest import)."""
    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


def test_audit_export_requires_auth():
    with TestClient(app) as client:
        rid = str(uuid.uuid4())
        r = client.get(f"/audit/export/{rid}")
        assert r.status_code == 401


def test_audit_export_404_when_no_logs(client_auth):
    rid = str(uuid.uuid4())
    r = client_auth.get(f"/audit/export/{rid}")
    assert r.status_code == 404


def test_audit_export_returns_pdf(client_auth):
    rid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        db.add(
            AuditLog(
                agent_type="mine",
                step="START",
                timestamp=datetime.utcnow(),
                input_text="request",
                output_text="starting | sig=abc123",
                status="ok",
                run_id=rid,
            )
        )
        db.add(
            AuditLog(
                agent_type="mine",
                step="CHECK_RULES",
                timestamp=datetime.utcnow(),
                input_text="OK",
                output_text=str({"allowed": True, "action": "ALLOW"}),
                status="ok",
                run_id=rid,
            )
        )
        db.add(
            AuditLog(
                agent_type="mine",
                step="END",
                timestamp=datetime.utcnow(),
                input_text=str({"status": "OK", "data": {"mine_name": "X", "country": "Kenya"}}),
                output_text="done | sig=def456",
                status="ok",
                run_id=rid,
            )
        )
        db.commit()
    finally:
        db.close()

    r = client_auth.get(f"/audit/export/{rid}")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_audit_export_invalid_uuid(client_auth):
    r = client_auth.get("/audit/export/not-a-uuid")
    assert r.status_code == 400
