import hashlib
import hmac
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app.api.deps import get_current_user
from backend.app.core.config import AUDIT_HMAC_SECRET
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


def _sign(agent_type: str, step: str, input_text: str, output_text: str, status: str) -> str:
    payload = f"{agent_type}|{step}|{input_text}|{output_text}|{status}"
    return hmac.new(AUDIT_HMAC_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _chain(prev_chain: str, run_id: str, step: str, input_text: str, output_text: str, status: str) -> str:
    fp = hashlib.sha256(f"{input_text}|{output_text}|{status}|{step}".encode("utf-8")).hexdigest()[:24]
    payload = f"{prev_chain}|{run_id}|{step}|{fp}|{status}"
    return hmac.new(AUDIT_HMAC_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:24]


def _stamped_output(agent_type: str, run_id: str, step: str, input_text: str, output_text: str, status: str, prev_chain: str) -> tuple[str, str]:
    sig = _sign(agent_type, step, input_text, output_text, status)
    ctag = _chain(prev_chain, run_id, step, input_text, output_text, status)
    stamped = f"{output_text} | sig={sig} | chain={ctag} | audit_integrity_verified=true"
    return stamped, ctag


def test_audit_replay_and_verify_ok(client_auth):
    rid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        prev = ""
        out1, prev = _stamped_output("mine", rid, "START", "request", "starting", "ok", prev)
        out2, prev = _stamped_output(
            "mine",
            rid,
            "END",
            "{'status': 'OK', 'reason': 'Checks passed', 'requires_human_review': False}",
            "done",
            "ok",
            prev,
        )
        db.add(
            AuditLog(
                agent_type="mine",
                step="START",
                timestamp=datetime.utcnow(),
                input_text="request",
                output_text=out1,
                status="ok",
                run_id=rid,
            )
        )
        db.add(
            AuditLog(
                agent_type="mine",
                step="END",
                timestamp=datetime.utcnow(),
                input_text="{'status': 'OK', 'reason': 'Checks passed', 'requires_human_review': False}",
                output_text=out2,
                status="ok",
                run_id=rid,
            )
        )
        db.commit()
    finally:
        db.close()

    replay = client_auth.get(f"/audit/{rid}/replay")
    assert replay.status_code == 200
    body = replay.json()
    assert body["integrity_valid"] is True
    assert body["broken_at_step"] is None
    assert body["reconstructed_decision"]["status"] == "OK"
    assert body["reconstructed_decision"]["reason"] == "Checks passed"
    assert body["reconstructed_decision"]["requires_human_review"] is False

    verify = client_auth.get(f"/audit/{rid}/verify")
    assert verify.status_code == 200
    assert verify.json()["integrity_valid"] is True
    assert verify.json()["broken_at_step"] is None


def test_audit_replay_detects_tampering(client_auth):
    rid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)
        prev = ""
        out1, prev = _stamped_output("bank", rid, "START", "request", "starting", "ok", prev)
        out2, prev = _stamped_output(
            "bank",
            rid,
            "END",
            "{'status': 'REVIEW', 'reason': 'Needs review', 'requires_human_review': True}",
            "done",
            "ok",
            prev,
        )
        tampered = out2.replace("done", "done-tampered", 1)
        db.add(
            AuditLog(
                agent_type="bank",
                step="START",
                timestamp=datetime.utcnow(),
                input_text="request",
                output_text=out1,
                status="ok",
                run_id=rid,
            )
        )
        db.add(
            AuditLog(
                agent_type="bank",
                step="END",
                timestamp=datetime.utcnow(),
                input_text="{'status': 'REVIEW', 'reason': 'Needs review', 'requires_human_review': True}",
                output_text=tampered,
                status="ok",
                run_id=rid,
            )
        )
        db.commit()
    finally:
        db.close()

    replay = client_auth.get(f"/audit/{rid}/replay")
    assert replay.status_code == 200
    body = replay.json()
    assert body["integrity_valid"] is False
    assert body["broken_at_step"] == 1
    assert body["reconstructed_decision"]["status"] == "REVIEW"

    verify = client_auth.get(f"/audit/{rid}/verify")
    assert verify.status_code == 200
    assert verify.json()["integrity_valid"] is False
    assert verify.json()["broken_at_step"] == 1
