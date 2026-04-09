import json
import logging
import time

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.app.api import agents, audit, auth, hitl, config as runtime_config_api
from backend.app.core.ws import hitl_ws_manager
from backend.app.db.models import Base
from backend.app.db.session import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Kifaru Guard MVP")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    last_error = None
    for attempt in range(1, 31):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            logger.info("service_startup db_ready=true attempt=%s", attempt)
            return
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
async def ws_hitl(ws: WebSocket):
    await hitl_ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hitl_ws_manager.disconnect(ws)
