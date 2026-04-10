import logging
import re
import uuid as uuid_lib

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.api.deps import get_current_user
from backend.app.core.runtime_config import load_runtime_config
from backend.app.db.models import AuditLog, HitlQueue
from backend.app.db.session import get_db
from backend.app.services.audit_report_pdf import build_compliance_report_pdf

router = APIRouter(tags=["audit"])
logger = logging.getLogger(__name__)


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
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.run_id == rid)
            .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
            .all()
        )
        if not logs:
            raise HTTPException(status_code=404, detail="No audit data for this run_id")

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
