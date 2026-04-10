"""
Single-run (case) view: aggregates audit trail, extracted fields, and HITL for one run_id.
"""
from __future__ import annotations

import ast
import logging
import uuid as uuid_lib

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.api.deps import get_current_user
from backend.app.db.models import AuditLog, HitlQueue
from backend.app.db.session import get_db

router = APIRouter(prefix="/cases", tags=["cases"])
logger = logging.getLogger(__name__)


def _strip_sig(text: str | None) -> str:
    if not text:
        return ""
    if " | sig=" in text:
        return text.rsplit(" | sig=", 1)[0].strip()
    return str(text).strip()


def _parse_result_dict(blob: str | None) -> dict | None:
    raw = _strip_sig(blob)
    if not raw:
        return None
    try:
        val = ast.literal_eval(raw)
        if isinstance(val, dict):
            return val
    except (SyntaxError, ValueError, TypeError):
        return None
    return None


def _preview(text: str | None, max_len: int = 400) -> str:
    s = _strip_sig(text).replace("\r", " ").replace("\n", " ")
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


@router.get("/{run_id}")
def get_case(
    run_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rid = (run_id or "").strip()
    try:
        uuid_lib.UUID(rid)
    except (ValueError, TypeError):
        logger.warning("case_lookup_invalid_run_id")
        raise HTTPException(status_code=400, detail="Invalid run_id")

    try:
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.run_id == rid)
            .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
            .all()
        )
        if not logs:
            raise HTTPException(status_code=404, detail="Case not found")

        agent_type = logs[0].agent_type
        t_start = logs[0].timestamp
        t_end = logs[-1].timestamp

        end_row = next((x for x in reversed(logs) if x.step == "END"), None)
        ex_row = next((x for x in reversed(logs) if x.step == "EXTRACT_DATA"), None)

        final_parsed = _parse_result_dict(end_row.input_text) if end_row else None
        if not final_parsed and ex_row:
            final_parsed = _parse_result_dict(ex_row.output_text)

        final_status = None
        extracted_data = None
        if final_parsed:
            final_status = final_parsed.get("status")
            data = final_parsed.get("data")
            if isinstance(data, dict):
                extracted_data = data

        hitl_row = db.query(HitlQueue).filter(HitlQueue.run_id == rid).first()
        hitl_out = None
        if hitl_row:
            hitl_out = {
                "id": hitl_row.id,
                "agent_type": hitl_row.agent_type,
                "reason": hitl_row.reason,
                "status": hitl_row.status,
                "agent_result_status": hitl_row.agent_result_status,
                "created_at": hitl_row.timestamp,
                "reviewed_by": hitl_row.reviewed_by,
                "reviewed_at": hitl_row.reviewed_at,
            }

        audit_out = [
            {
                "id": log.id,
                "step": log.step,
                "timestamp": log.timestamp,
                "status": log.status,
                "input_preview": _preview(log.input_text),
                "output_preview": _preview(log.output_text),
            }
            for log in logs
        ]

        return {
            "run_id": rid,
            "agent_type": agent_type,
            "summary": {
                "final_status": str(final_status) if final_status is not None else None,
                "started_at": t_start,
                "completed_at": t_end,
                "step_count": len(logs),
            },
            "extracted_data": extracted_data,
            "audit_logs": audit_out,
            "hitl": hitl_out,
        }
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("case_db_error run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not load case")
    except Exception:
        logger.exception("case_unexpected run_id=%s", rid)
        raise HTTPException(status_code=500, detail="Could not load case")
