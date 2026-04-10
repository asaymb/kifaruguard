import json
import logging
import time

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.app.api import agents, audit, auth, cases, hitl, inbox, config as runtime_config_api
from backend.app.core.config import (
    AUDIT_HMAC_SECRET,
    JWT_SECRET_KEY,
    get_cors_origins_and_credentials,
)
from backend.app.core.security import decode_token
from backend.app.core.ws import hitl_ws_manager
from backend.app.db.models import Base, User
from backend.app.db.session import SessionLocal, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Kifaru Guard MVP")

# Never combine allow_origins=["*"] with allow_credentials=True — browsers reject it; use explicit ALLOWED_ORIGINS.
_cors_origins, _cors_credentials = get_cors_origins_and_credentials()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _patch_schema_columns():
    """Add columns on existing DBs (no Alembic) — audit run_id, HITL correlation + reviewer fields."""
    try:
        with engine.begin() as conn:
            dialect = conn.dialect.name
            if dialect == "postgresql":
                conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)"))
                conn.execute(text("ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)"))
                conn.execute(text("ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS agent_result_status VARCHAR(50)"))
                conn.execute(text("ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100)"))
                conn.execute(text("ALTER TABLE hitl_queue ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_run_id ON audit_logs (run_id)"))
            elif dialect == "sqlite":
                for stmt, col in (
                    ("ALTER TABLE audit_logs ADD COLUMN run_id VARCHAR(64)", "audit_logs.run_id"),
                    ("ALTER TABLE hitl_queue ADD COLUMN run_id VARCHAR(64)", "hitl.run_id"),
                    ("ALTER TABLE hitl_queue ADD COLUMN agent_result_status VARCHAR(50)", "hitl.agent_result_status"),
                    ("ALTER TABLE hitl_queue ADD COLUMN reviewed_by VARCHAR(100)", "hitl.reviewed_by"),
                    ("ALTER TABLE hitl_queue ADD COLUMN reviewed_at TIMESTAMP", "hitl.reviewed_at"),
                ):
                    try:
                        conn.execute(text(stmt))
                    except Exception:
                        logger.debug("sqlite_column_skip col=%s (likely already present)", col)
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_run_id ON audit_logs (run_id)"))
                except Exception:
                    logger.debug("sqlite_index_skip ix_audit_logs_run_id", exc_info=True)
    except Exception:
        logger.warning("schema_column_patch_failed", exc_info=True)


@app.on_event("startup")
def startup():
    # Fail fast: no insecure defaults for signing tokens or audit lines.
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY must be set in the environment (no default fallback).")
    if not AUDIT_HMAC_SECRET:
        raise RuntimeError("AUDIT_HMAC_SECRET must be set in the environment for audit HMAC integrity.")

    last_error = None
    for attempt in range(1, 31):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            _patch_schema_columns()
            logger.info("service_startup db_ready=true attempt=%s", attempt)
            return
        except RuntimeError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning("service_startup db_ready=false attempt=%s error=%s", attempt, exc)
            time.sleep(2)
    logger.error("service_startup_failed error=%s", last_error)
    raise RuntimeError("Database unavailable at startup")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, str):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    return JSONResponse(status_code=exc.status_code, content={"error": "Request failed"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error path=%s error=%s", request.url.path, exc)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(audit.router)
app.include_router(cases.router)
app.include_router(inbox.router)
app.include_router(hitl.router)
app.include_router(runtime_config_api.router)


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception:
        return JSONResponse(status_code=503, content={"error": "Database unavailable"})


@app.websocket("/ws/audit")
async def ws_audit(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            await ws.send_text(json.dumps({"event": "ack", "message": msg}))
    except WebSocketDisconnect:
        return


@app.websocket("/ws/hitl")
async def ws_hitl(ws: WebSocket, token: str | None = Query(default=None)):
    # Same JWT as REST — query param because browsers cannot attach Authorization headers to WebSocket in all setups.
    if not token or not str(token).strip():
        logger.warning("ws_hitl_rejected reason=missing_token")
        await ws.close(code=1008)
        return
    username = decode_token(token.strip())
    if not username:
        logger.warning("ws_hitl_rejected reason=invalid_token")
        await ws.close(code=1008)
        return
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
    finally:
        db.close()
    if not user:
        logger.warning("ws_hitl_rejected reason=user_not_found")
        await ws.close(code=1008)
        return

    await hitl_ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hitl_ws_manager.disconnect(ws)
