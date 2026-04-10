import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from backend.app.api.deps import get_current_user
from backend.app.core.ws import hitl_ws_manager
from backend.app.db.models import HitlQueue, User
from backend.app.db.session import get_db

router = APIRouter(tags=["hitl"])
logger = logging.getLogger(__name__)


@router.get("/hitl")
def get_hitl(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    agent_type: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        query = db.query(HitlQueue)
        if status:
            query = query.filter(HitlQueue.status == status)
        if agent_type:
            query = query.filter(HitlQueue.agent_type == agent_type)

        total = query.count()
        rows = (
            query.order_by(HitlQueue.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [
                {
                    "id": r.id,
                    "agent_type": r.agent_type,
                    "reason": r.reason,
                    "status": r.status,
                    "timestamp": r.timestamp,
                    "run_id": r.run_id,
                    "agent_result_status": r.agent_result_status,
                    "reviewed_by": r.reviewed_by,
                    "reviewed_at": r.reviewed_at,
                }
                for r in rows
            ],
            "page": page,
            "page_size": page_size,
            "total": total,
        }
    except SQLAlchemyError:
        logger.exception("Failed to load HITL queue")
        raise HTTPException(status_code=500, detail="Could not load HITL queue")
    except Exception:
        logger.exception("Unexpected error while loading HITL queue")
        raise HTTPException(status_code=500, detail="Could not load HITL queue")


@router.post("/hitl/{item_id}/approve")
async def approve(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        row = db.query(HitlQueue).filter(HitlQueue.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        row.status = "approved"
        row.reviewed_by = user.username
        row.reviewed_at = datetime.utcnow()
        db.add(row)
        await hitl_ws_manager.broadcast(
            json.dumps({"event": "hitl_updated", "id": row.id, "status": row.status, "run_id": row.run_id})
        )
        return {"ok": True}
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Failed to approve HITL item id=%s", item_id)
        raise HTTPException(status_code=500, detail="Could not approve item")
    except Exception:
        logger.exception("Unexpected error approving HITL item id=%s", item_id)
        raise HTTPException(status_code=500, detail="Could not approve item")


@router.post("/hitl/{item_id}/reject")
async def reject(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        row = db.query(HitlQueue).filter(HitlQueue.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        row.status = "rejected"
        row.reviewed_by = user.username
        row.reviewed_at = datetime.utcnow()
        db.add(row)
        await hitl_ws_manager.broadcast(
            json.dumps({"event": "hitl_updated", "id": row.id, "status": row.status, "run_id": row.run_id})
        )
        return {"ok": True}
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Failed to reject HITL item id=%s", item_id)
        raise HTTPException(status_code=500, detail="Could not reject item")
    except Exception:
        logger.exception("Unexpected error rejecting HITL item id=%s", item_id)
        raise HTTPException(status_code=500, detail="Could not reject item")
