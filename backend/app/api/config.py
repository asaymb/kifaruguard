from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.deps import get_current_user
from backend.app.core.runtime_config import load_runtime_config, save_runtime_config

router = APIRouter(prefix="/config", tags=["config"])


class AgentsConfigUpdate(BaseModel):
    mine: bool
    bank: bool


class GuardrailsConfigUpdate(BaseModel):
    block_on_status: list[str]


@router.get("/runtime")
def get_runtime_config(_=Depends(get_current_user)):
    return load_runtime_config()


@router.post("/agents")
def update_agents(payload: AgentsConfigUpdate, _=Depends(get_current_user)):
    cfg = load_runtime_config()
    cfg.setdefault("agents", {})
    cfg["agents"]["mine"] = payload.mine
    cfg["agents"]["bank"] = payload.bank
    save_runtime_config(cfg)
    return {"ok": True, "agents": cfg["agents"]}


@router.post("/guardrails")
def update_guardrails(payload: GuardrailsConfigUpdate, _=Depends(get_current_user)):
    if not payload.block_on_status:
        raise HTTPException(status_code=400, detail="block_on_status cannot be empty")
    cfg = load_runtime_config()
    cfg.setdefault("guardrails", {})
    cfg["guardrails"]["block_on_status"] = [x.upper() for x in payload.block_on_status]
    save_runtime_config(cfg)
    return {"ok": True, "guardrails": cfg["guardrails"]}
