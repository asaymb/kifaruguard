"""
Document inbox: store PDFs under AGENT_FILE_ROOT (default /app/data/uploads) for workflow-style processing.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from backend.app.api.deps import get_current_user

router = APIRouter(prefix="/inbox", tags=["inbox"])
logger = logging.getLogger(__name__)

# Same root as agent file_path resolution — keeps inbox + /agents/run consistent.
UPLOAD_ROOT = os.path.abspath(os.getenv("AGENT_FILE_ROOT", "/app/data/uploads"))
MAX_BYTES = int(os.getenv("MAX_AGENT_PDF_BYTES", str(10 * 1024 * 1024)))


def _ensure_dir() -> None:
    os.makedirs(UPLOAD_ROOT, exist_ok=True)


def _safe_basename(name: str | None) -> str:
    if not name or "\x00" in name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    base = os.path.basename(name.replace("\\", "/"))
    if not base or base in (".", "..") or "/" in base or "\\" in base:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not base.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    return base


def _unique_name(root: str, base: str) -> str:
    stem, ext = os.path.splitext(base)
    candidate = base
    n = 0
    while os.path.exists(os.path.join(root, candidate)):
        n += 1
        candidate = f"{stem}_{uuid.uuid4().hex[:8]}{ext}"
        if n > 50:
            raise HTTPException(status_code=500, detail="Could not allocate a unique filename")
    return candidate


@router.get("")
def list_inbox(_=Depends(get_current_user)):
    """List PDFs in the upload directory (newest first)."""
    _ensure_dir()
    items: list[dict] = []
    try:
        for entry in os.scandir(UPLOAD_ROOT):
            if not entry.is_file() or entry.name.startswith("."):
                continue
            if not entry.name.lower().endswith(".pdf"):
                continue
            try:
                st = entry.stat()
            except OSError:
                continue
            items.append(
                {
                    "filename": entry.name,
                    "size_bytes": st.st_size,
                    "uploaded_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
    except OSError as e:
        logger.exception("inbox_list_failed")
        raise HTTPException(status_code=500, detail="Could not read inbox") from e

    items.sort(key=lambda x: x["uploaded_at"], reverse=True)
    return {"items": items}


@router.post("/upload")
async def upload_inbox(file: UploadFile = File(...), _=Depends(get_current_user)):
    """Save a PDF to the shared upload directory."""
    _ensure_dir()
    base = _safe_basename(file.filename)
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        logger.warning("inbox_upload_rejected reason=too_large size=%s", len(raw))
        raise HTTPException(status_code=400, detail="File exceeds maximum size")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF file")

    final_name = _unique_name(UPLOAD_ROOT, base)
    path = os.path.join(UPLOAD_ROOT, final_name)
    try:
        with open(path, "wb") as f:
            f.write(raw)
    except OSError as e:
        logger.exception("inbox_upload_write_failed")
        raise HTTPException(status_code=500, detail="Could not save file") from e

    logger.info("inbox_upload_ok filename=%s bytes=%s", final_name, len(raw))
    st = os.stat(path)
    return {
        "ok": True,
        "filename": final_name,
        "size_bytes": st.st_size,
        "uploaded_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    }
