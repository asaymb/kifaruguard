import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from backend.app.api.deps import get_current_user
from backend.app.db.models import AuditLog
from backend.app.db.session import get_db

router = APIRouter(tags=["audit"])
logger = logging.getLogger(__name__)


@router.get("/audit")
def get_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    agent_type: str | None = Query(None),
    step: str | None = Query(None),
    status: str | None = Query(None),
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
