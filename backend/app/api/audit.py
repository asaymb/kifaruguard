import ast
import hashlib
import hmac
import json
import logging
import re
import uuid as uuid_lib

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.api.deps import get_current_user
from backend.app.core.config import AUDIT_HMAC_SECRET
from backend.app.core.runtime_config import load_runtime_config
from backend.app.db.models import AuditLog, HitlQueue
from backend.app.db.session import get_db
from backend.app.services.audit_report_pdf import build_compliance_report_pdf
from backend.app.services.audit_replay_pdf import build_audit_replay_pdf

router = APIRouter(tags=["audit"])
logger = logging.getLogger(__name__)

_SIG_RE = re.compile(r"\| sig=([a-f0-9]{64})\b")
_CHAIN_RE = re.compile(r"\| chain=([a-f0-9]{24})\b")


class AuditReplayStep(BaseModel):
    id: int
    step: str
    timestamp: str | None
    status: str
    input_text: str
    output_text: str
    signature_valid: bool
    chain_valid: bool
    integrity_verified: bool


class ReconstructedDecision(BaseModel):
    status: str
    reason: str
    requires_human_review: bool


class AuditReplayResponse(BaseModel):
    run_id: str
    steps: list[AuditReplayStep]
    integrity_valid: bool
    broken_at_step: int | None
    reconstructed_decision: ReconstructedDecision


class AuditVerifyResponse(BaseModel):
    run_id: str
    integrity_valid: bool
    broken_at_step: int | None


def _safe_text(value: str | None, limit: int = 4000) -> str:
    value = value or ""
    return re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", value)[:limit]


def _extract_meta(output_text: str | None) -> tuple[str, str, str]:
    raw = output_text or ""
    sig_match = _SIG_RE.search(raw)
    chain_match = _CHAIN_RE.search(raw)
    sig = sig_match.group(1) if sig_match else ""
    chain = chain_match.group(1) if chain_match else ""
    stripped = _SIG_RE.sub("", raw)
    stripped = _CHAIN_RE.sub("", stripped)
    stripped = stripped.replace("| audit_integrity_verified=true", "")
    stripped = re.sub(r"\s+\|\s*$", "", stripped).strip()
    return stripped, sig, chain


def _compute_sig(agent_type: str, step: str, input_text: str, output_text: str, status: str) -> str:
    payload = f"{agent_type}|{step}|{input_text}|{output_text}|{status}"
    return hmac.new(AUDIT_HMAC_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _compute_chain(prev_chain: str, run_id: str, step: str, input_text: str, output_text: str, status: str) -> str:
    fp = hashlib.sha256(f"{input_text}|{output_text}|{status}|{step}".encode("utf-8")).hexdigest()[:24]
    chain_payload = f"{prev_chain}|{run_id}|{step}|{fp}|{status}"
    return hmac.new(AUDIT_HMAC_SECRET.encode("utf-8"), chain_payload.encode("utf-8"), hashlib.sha256).hexdigest()[:24]


def _reconstruct_decision(steps: list[dict]) -> dict:
    end = None
    for row in reversed(steps):
        if row.get("step") == "END":
            end = row
            break
    if not end:
        return {
            "status": "REVIEW",
            "reason": "Final decision step not found; manual review required.",
            "requires_human_review": True,
        }

    try:
        payload = ast.literal_eval(end.get("input_text") or "{}")
        if isinstance(payload, dict):
            status = str(payload.get("status") or "REVIEW").upper()
            reason = str(payload.get("reason") or "").strip() or "Decision replayed from audit trail."
            requires = bool(payload.get("requires_human_review")) or status == "REVIEW"
            return {
                "status": status,
                "reason": reason,
                "requires_human_review": requires,
            }
    except Exception:
        logger.exception("audit_replay_parse_end_failed")
    return {
        "status": "REVIEW",
        "reason": "Unable to parse final decision from audit step; manual review required.",
        "requires_human_review": True,
    }


def _verify_steps_integrity(run_id: str, logs: list[AuditLog]) -> tuple[list[dict], bool, int | None]:
    steps: list[dict] = []
    prev_chain = ""
    integrity_valid = True
    broken_at_step = None

    for i, row in enumerate(logs):
        safe_in = _safe_text(row.input_text)
        clean_out, sig, chain = _extract_meta(row.output_text)
        safe_out = _safe_text(clean_out)

        expected_sig = _compute_sig(row.agent_type, row.step, safe_in, safe_out, row.status)
        expected_chain = _compute_chain(prev_chain, run_id, row.step, safe_in, safe_out, row.status)

        sig_valid = bool(sig) and hmac.compare_digest(sig, expected_sig)
        chain_valid = bool(chain) and hmac.compare_digest(chain, expected_chain)
        step_valid = sig_valid and chain_valid
        if not step_valid and integrity_valid:
            integrity_valid = False
            broken_at_step = i

        steps.append(
            {
                "id": row.id,
                "step": row.step,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "status": row.status,
                "input_text": safe_in,
                "output_text": safe_out,
                "signature_valid": sig_valid,
                "chain_valid": chain_valid,
                "integrity_verified": step_valid,
            }
        )
        prev_chain = chain

    return steps, integrity_valid, broken_at_step


def _extract_last_chain_from_logs(logs: list[AuditLog]) -> str | None:
    for row in reversed(logs):
        _clean, _sig, chain = _extract_meta(row.output_text)
        if chain:
            return chain
    return None


def _load_run_logs(db: Session, rid: str) -> list[AuditLog]:
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.run_id == rid)
        .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
        .all()
    )
    if not logs:
        raise HTTPException(status_code=404, detail="No audit data for this run_id")
    return logs


def _build_replay_payload(rid: str, logs: list[AuditLog]) -> dict:
    steps, integrity_valid, broken_at_step = _verify_steps_integrity(rid, logs)
    reconstructed_decision = _reconstruct_decision(steps)
    return {
        "run_id": rid,
        "steps": steps,
        "integrity_valid": integrity_valid,
        "broken_at_step": broken_at_step,
        "reconstructed_decision": reconstructed_decision,
    }


@router.get("/audit")
def get_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    agent_type: str | None = Query(None),
    step: str | None = Query(None),
    status: str | None = Query(None),
    run_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        query = db.query(AuditLog)
        if agent_type:
            query = query.filter(AuditLog.agent_type == agent_type)
        if step:
            query = query.filter(AuditLog.step == step)
        if status:
            query = query.filter(AuditLog.status == status)
        if run_id:
            query = query.filter(AuditLog.run_id == run_id)

        total = query.count()
        rows = (
            query.order_by(AuditLog.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [
                {
                    "id": r.id,
                    "agent_type": r.agent_type,
                    "step": r.step,
                    "timestamp": r.timestamp,
                    "input_text": r.input_text,
                    "output_text": r.output_text,
                    "status": r.status,
                    "run_id": r.run_id,
                }
                for r in rows
            ],
            "page": page,
            "page_size": page_size,
            "total": total,
        }
    except SQLAlchemyError:
        logger.exception("Failed to load audit logs")
        raise HTTPException(status_code=500, detail="Could not load audit logs")
    except Exception:
        logger.exception("Unexpected error while reading audit logs")
        raise HTTPException(status_code=500, detail="Could not load audit logs")


@router.get("/audit/export/{run_id}")
def export_audit_pdf(
    run_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Full compliance PDF for one agent run (auth required)."""
    rid = (run_id or "").strip()
    try:
        uuid_lib.UUID(rid)
    except (ValueError, TypeError):
        logger.warning("audit_export_rejected reason=invalid_run_id")
        raise HTTPException(status_code=400, detail="Invalid run_id")

    try:
        logs = _load_run_logs(db, rid)

        agent_type = logs[0].agent_type
        hitl_row = db.query(HitlQueue).filter(HitlQueue.run_id == rid).first()
        cfg = load_runtime_config()
        block_statuses = cfg.get("guardrails", {}).get("block_on_status", ["BLOCKED"])
        if not isinstance(block_statuses, list):
            block_statuses = ["BLOCKED"]
        block_statuses = [str(x).upper() for x in block_statuses]

        pdf_bytes = build_compliance_report_pdf(
            run_id=rid,
            agent_type=agent_type,
            logs=logs,
            hitl_row=hitl_row,
            guardrail_block_statuses=block_statuses,
        )
        safe_name = re.sub(r"[^\w.\-]+", "_", rid[:40]) or "run"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="kifaru-compliance-report-{safe_name}.pdf"',
            },
        )
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("audit_export_db_error run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not export audit report")
    except Exception:
        logger.exception("audit_export_failed run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not generate PDF")


@router.get("/audit/{run_id}/export")
def export_replay_pdf(
    run_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rid = (run_id or "").strip()
    try:
        uuid_lib.UUID(rid)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid run_id")

    try:
        logs = _load_run_logs(db, rid)
        replay_payload = _build_replay_payload(rid, logs)
        final_chain = _extract_last_chain_from_logs(logs)
        pdf_bytes = build_audit_replay_pdf(
            run_id=rid,
            replay_payload=replay_payload,
            generated_at_utc=str(logs[-1].timestamp) if logs and logs[-1].timestamp else None,
            final_chain=final_chain,
        )
        safe_name = re.sub(r"[^\w.\-]+", "_", rid[:40]) or "run"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="kifaru-audit-replay-{safe_name}.pdf"',
            },
        )
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("audit_replay_export_db_error run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not export replay report")
    except Exception:
        logger.exception("audit_replay_export_failed run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not export replay report")


@router.get("/audit/{run_id}/replay", response_model=AuditReplayResponse)
def replay_audit_run(
    run_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rid = (run_id or "").strip()
    try:
        uuid_lib.UUID(rid)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid run_id")

    try:
        logs = _load_run_logs(db, rid)
        payload = _build_replay_payload(rid, logs)
        integrity_valid = bool(payload["integrity_valid"])
        logger.info(json.dumps({"event": "audit_replay", "run_id": rid, "integrity_valid": integrity_valid}))
        return payload
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("audit_replay_db_error run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not replay audit run")
    except Exception:
        logger.exception("audit_replay_failed run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not replay audit run")


@router.get("/audit/{run_id}/verify", response_model=AuditVerifyResponse)
def verify_audit_run(
    run_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rid = (run_id or "").strip()
    try:
        uuid_lib.UUID(rid)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid run_id")

    try:
        logs = _load_run_logs(db, rid)
        payload = _build_replay_payload(rid, logs)
        integrity_valid = bool(payload["integrity_valid"])
        broken_at_step = payload["broken_at_step"]
        logger.info(json.dumps({"event": "audit_replay", "run_id": rid, "integrity_valid": integrity_valid}))
        return {
            "run_id": rid,
            "integrity_valid": integrity_valid,
            "broken_at_step": broken_at_step,
        }
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("audit_verify_db_error run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not verify audit run")
    except Exception:
        logger.exception("audit_verify_failed run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not verify audit run")
