import json
import os
import re
import tempfile
import logging
import hmac
import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.agents.orchestrator import run_state_machine
from backend.app.agents.pdf_reader import extract_text_from_pdf
from backend.app.api.deps import get_current_user
from backend.app.core.runtime_config import is_agent_enabled
from backend.app.core.ws import hitl_ws_manager
from backend.app.db.models import AuditLog, HitlQueue
from backend.app.db.session import get_db

router = APIRouter(prefix="/agents", tags=["agents"])
logger = logging.getLogger(__name__)
_AUDIT_SECRET = os.getenv("AUDIT_HMAC_SECRET", os.getenv("JWT_SECRET_KEY", "audit-default"))


def _safe_text(value: str, limit: int = 4000) -> str:
    value = value or ""
    return re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", value)[:limit]


def _sign(agent_type: str, step: str, input_text: str, output_text: str, status: str) -> str:
    payload = f"{agent_type}|{step}|{input_text}|{output_text}|{status}"
    return hmac.new(_AUDIT_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _log(db: Session, agent_type: str, step: str, input_text: str, output_text: str, status: str):
    try:
        db.add(
            AuditLog(
                agent_type=agent_type,
                step=step,
                timestamp=datetime.utcnow(),
                input_text=_safe_text(input_text),
                output_text=_safe_text(output_text) + f" | sig={_sign(agent_type, step, _safe_text(input_text), _safe_text(output_text), status)}",
                status=status,
            )
        )
        logger.info("audit_saved agent=%s step=%s status=%s", agent_type, step, status)
    except Exception:
        logger.exception("audit_save_failed step=%s", step)


@router.post("/run")
async def run_agent(
    request: Request,
    agent_type: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    file_path: str | None = Form(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    logger.info("agent_run_received")
    temp_path = None
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            payload = await request.json()
            agent_type = payload.get("agent_type")
            file_path = payload.get("file_path")

        if agent_type not in {"mine", "bank"}:
            raise HTTPException(status_code=400, detail="agent_type must be mine or bank")
        if not is_agent_enabled(agent_type):
            raise HTTPException(status_code=403, detail=f"Agent '{agent_type}' is disabled")

        if file is not None:
            filename = (file.filename or "").lower()
            if filename and not filename.endswith(".pdf"):
                raise HTTPException(status_code=400, detail="Only PDF files are supported")

            raw = await file.read()
            if not raw:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            if not raw.startswith(b"%PDF"):
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(raw)
                temp_path = tmp.name
            source_path = temp_path
        elif file_path:
            source_path = os.path.normpath(file_path)
            if not os.path.exists(source_path):
                raise HTTPException(status_code=404, detail="file_path not found")
            if not source_path.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail="file_path must point to a PDF file")
        else:
            raise HTTPException(status_code=400, detail="Provide file or file_path")

        try:
            text = extract_text_from_pdf(source_path)
        except Exception:
            logger.exception("pdf_extract_failed path=%s", source_path)
            raise HTTPException(status_code=400, detail="Unable to read PDF")

        result = run_state_machine(
            agent_type,
            _safe_text(text, limit=10000),
            "/app/data/sanctions_mines.csv",
            "/app/data/sanctions_politiques.csv",
            lambda at, st, i, o, s: _log(db, at, st, i, o, s),
        )
        if result.get("status") == "REVIEW":
            row = HitlQueue(agent_type=agent_type, reason="Bank sanctions potential match", status="pending")
            db.add(row)
            db.flush()
            await hitl_ws_manager.broadcast(json.dumps({"event": "hitl_created", "agent_type": agent_type}))

        logger.info("agent_run_completed status=%s", result.get("status"))
        return result
    except SQLAlchemyError:
        logger.exception("agent_run_db_error")
        raise HTTPException(status_code=500, detail="Database error while running agent")
    except HTTPException:
        raise
    except Exception:
        logger.exception("agent_run_unexpected_error")
        raise HTTPException(status_code=500, detail="Failed to run agent")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.exception("temp_cleanup_failed path=%s", temp_path)
