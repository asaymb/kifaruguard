import json
import os
import re
import tempfile
import logging
import hmac
import hashlib
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.agents.orchestrator import run_state_machine
from backend.app.agents.pdf_reader import extract_text_from_pdf
from backend.app.api.deps import get_current_user
from backend.app.core.config import AUDIT_HMAC_SECRET
from backend.app.core.runtime_config import is_agent_enabled
from backend.app.core.ws import hitl_ws_manager
from backend.app.db.models import AuditLog, HitlQueue
from backend.app.db.session import get_db

router = APIRouter(prefix="/agents", tags=["agents"])
logger = logging.getLogger(__name__)

# Optional server-side paths: off by default so arbitrary filesystem read via JSON/form cannot occur.
AGENT_ALLOW_FILE_PATH = os.getenv("AGENT_ALLOW_FILE_PATH", "").lower() in ("1", "true", "yes")
AGENT_FILE_ROOT = os.path.abspath(os.getenv("AGENT_FILE_ROOT", "/app/data/uploads"))
MAX_AGENT_PDF_BYTES = int(os.getenv("MAX_AGENT_PDF_BYTES", str(10 * 1024 * 1024)))


def _safe_text(value: str, limit: int = 4000) -> str:
    value = value or ""
    return re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", value)[:limit]


def _sign(agent_type: str, step: str, input_text: str, output_text: str, status: str) -> str:
    payload = f"{agent_type}|{step}|{input_text}|{output_text}|{status}"
    return hmac.new(AUDIT_HMAC_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _log(db: Session, agent_type: str, step: str, input_text: str, output_text: str, status: str, run_id: str):
    try:
        db.add(
            AuditLog(
                agent_type=agent_type,
                step=step,
                timestamp=datetime.utcnow(),
                input_text=_safe_text(input_text),
                output_text=_safe_text(output_text) + f" | sig={_sign(agent_type, step, _safe_text(input_text), _safe_text(output_text), status)}",
                status=status,
                run_id=run_id,
            )
        )
        logger.info("audit_saved agent=%s step=%s status=%s", agent_type, step, status)
    except Exception:
        logger.exception("audit_save_failed step=%s", step)


def _validate_upload_filename(filename: str | None) -> None:
    """Reject path traversal in client-provided names (security: basename only, no .. or NUL)."""
    if not filename:
        return
    if "\x00" in filename:
        logger.warning("agent_input_rejected reason=nul_in_filename")
        raise HTTPException(status_code=400, detail="Invalid filename")
    base = os.path.basename(filename.replace("\\", "/"))
    if base != filename.replace("\\", "/").split("/")[-1]:
        logger.warning("agent_input_rejected reason=path_in_filename")
        raise HTTPException(status_code=400, detail="Invalid filename")
    if ".." in base or base.strip() == "":
        logger.warning("agent_input_rejected reason=unsafe_filename")
        raise HTTPException(status_code=400, detail="Invalid filename")


def _safe_file_under_upload_root(file_path: str) -> str:
    """Only a plain filename under AGENT_FILE_ROOT — no subpaths (blocks ../ and absolute paths)."""
    raw = str(file_path).strip()
    if not raw or "\x00" in raw:
        logger.warning("agent_input_rejected reason=empty_or_nul_file_path")
        raise HTTPException(status_code=400, detail="Invalid file_path")
    unix = raw.replace("\\", "/")
    if "/" in unix:
        logger.warning("agent_input_rejected reason=file_path_not_basename_only")
        raise HTTPException(status_code=400, detail="file_path must be a filename only (no path separators)")
    name = os.path.basename(unix)
    if not name or name in (".", ".."):
        logger.warning("agent_input_rejected reason=invalid_basename")
        raise HTTPException(status_code=400, detail="Invalid file_path")
    root_real = os.path.realpath(AGENT_FILE_ROOT)
    try:
        candidate = os.path.realpath(os.path.join(root_real, name))
    except (OSError, ValueError):
        logger.warning("agent_input_rejected reason=path_resolution_failed")
        raise HTTPException(status_code=400, detail="Invalid file_path")
    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        logger.warning("agent_input_rejected reason=path_outside_root root=%s attempted=%s", root_real, candidate)
        raise HTTPException(status_code=400, detail="file_path must resolve under the configured upload root")
    return candidate


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
    run_id = str(uuid.uuid4())
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            payload = await request.json()
            agent_type = payload.get("agent_type")
            file_path = payload.get("file_path")

        if agent_type not in {"mine", "bank"}:
            logger.warning("agent_input_rejected reason=bad_agent_type value=%r", agent_type)
            raise HTTPException(status_code=400, detail="agent_type must be mine or bank")
        if not is_agent_enabled(agent_type):
            raise HTTPException(status_code=403, detail=f"Agent '{agent_type}' is disabled")

        if file is not None:
            _validate_upload_filename(file.filename)
            filename = (file.filename or "").lower()
            if filename and not filename.endswith(".pdf"):
                logger.warning("agent_input_rejected reason=not_pdf_filename")
                raise HTTPException(status_code=400, detail="Only PDF files are supported")

            raw = await file.read()
            if len(raw) > MAX_AGENT_PDF_BYTES:
                logger.warning("agent_input_rejected reason=file_too_large size=%s max=%s", len(raw), MAX_AGENT_PDF_BYTES)
                raise HTTPException(status_code=400, detail="PDF exceeds maximum allowed size")
            if not raw:
                logger.warning("agent_input_rejected reason=empty_upload")
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            if not raw.startswith(b"%PDF"):
                logger.warning("agent_input_rejected reason=invalid_pdf_magic")
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(raw)
                temp_path = tmp.name
            source_path = temp_path
        elif file_path:
            # file_path is disabled unless AGENT_ALLOW_FILE_PATH is set — eliminates LFI by default.
            if not AGENT_ALLOW_FILE_PATH:
                logger.warning("agent_input_rejected reason=file_path_disabled")
                raise HTTPException(
                    status_code=403,
                    detail="file_path is disabled; upload a PDF or enable AGENT_ALLOW_FILE_PATH with a locked AGENT_FILE_ROOT",
                )
            source_path = _safe_file_under_upload_root(str(file_path))
            if not os.path.isfile(source_path):
                logger.warning("agent_input_rejected reason=not_a_file path=%s", source_path)
                raise HTTPException(status_code=404, detail="file_path not found")
            if not source_path.lower().endswith(".pdf"):
                logger.warning("agent_input_rejected reason=file_path_not_pdf")
                raise HTTPException(status_code=400, detail="file_path must point to a PDF file")
        else:
            logger.warning("agent_input_rejected reason=missing_input")
            raise HTTPException(status_code=400, detail="Provide file upload")

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
            lambda at, st, i, o, s: _log(db, at, st, i, o, s, run_id),
        )
        out_status = result.get("status")
        if out_status == "REVIEW":
            row = HitlQueue(
                agent_type=agent_type,
                reason="Bank sanctions potential match",
                status="pending",
                run_id=run_id,
                agent_result_status=str(out_status),
            )
            db.add(row)
            db.flush()
            await hitl_ws_manager.broadcast(
                json.dumps({"event": "hitl_created", "agent_type": agent_type, "run_id": run_id, "agent_result_status": out_status})
            )

        logger.info("agent_run_completed run_id=%s status=%s", run_id, out_status)
        return {**result, "run_id": run_id}
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
