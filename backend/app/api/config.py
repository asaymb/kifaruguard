from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from backend.app.api.deps import get_current_user
from backend.app.core.runtime_config import (
    derive_block_on_status_from_rules,
    load_runtime_config,
    save_runtime_config,
)

router = APIRouter(prefix="/config", tags=["config"])


class AgentsConfigUpdate(BaseModel):
    mine: bool
    bank: bool


class GuardrailRulePayload(BaseModel):
    """Single policy row: match agent outcome (condition) → action. No expression parser — exact status match only."""

    enabled: bool = True
    condition: str = Field(..., min_length=1, max_length=200)
    action: Literal["BLOCK", "REVIEW"]
    message: str = Field(default="", max_length=500)

    @field_validator("condition")
    @classmethod
    def strip_condition(cls, v: str) -> str:
        t = (v or "").strip()
        if not t:
            raise ValueError("condition cannot be empty")
        return t

    @field_validator("message")
    @classmethod
    def strip_message(cls, v: str) -> str:
        return (v or "").strip()


class GuardrailsWritePayload(BaseModel):
    rules: list[GuardrailRulePayload] | None = None
    block_on_status: list[str] | None = None

    @model_validator(mode="after")
    def exactly_one_shape(self):
        has_r = self.rules is not None
        has_b = self.block_on_status is not None
        if has_r == has_b:
            raise ValueError("Provide exactly one of: rules, block_on_status")
        return self


@router.get("/runtime")
def get_runtime_config(_=Depends(get_current_user)):
    return load_runtime_config()


@router.get("/guardrails")
def get_guardrails(_=Depends(get_current_user)):
    cfg = load_runtime_config()
    gr = cfg.get("guardrails", {}) if isinstance(cfg.get("guardrails"), dict) else {}
    raw_rules = gr.get("rules")
    out_rules: list[dict] = []
    if isinstance(raw_rules, list):
        for r in raw_rules:
            if not isinstance(r, dict):
                continue
            act = str(r.get("action", "BLOCK")).upper()
            if act not in ("BLOCK", "REVIEW"):
                act = "BLOCK"
            out_rules.append(
                {
                    "enabled": bool(r.get("enabled", True)),
                    "condition": str(r.get("condition", "")).strip(),
                    "action": act,
                    "message": str(r.get("message", ""))[:500],
                }
            )
    return {
        "rules": out_rules,
        "block_on_status": gr.get("block_on_status", ["BLOCKED"])
        if isinstance(gr.get("block_on_status"), list)
        else ["BLOCKED"],
    }


@router.post("/guardrails")
def update_guardrails(payload: GuardrailsWritePayload, _=Depends(get_current_user)):
    cfg = load_runtime_config()
    cfg.setdefault("guardrails", {})

    if payload.rules is not None:
        rules_dump = []
        for r in payload.rules:
            d = r.model_dump()
            d["condition"] = d["condition"].strip().upper()
            d["action"] = d["action"].upper()
            rules_dump.append(d)
        cfg["guardrails"]["rules"] = rules_dump
        cfg["guardrails"]["block_on_status"] = derive_block_on_status_from_rules(rules_dump)
    elif payload.block_on_status is not None:
        statuses = [str(x).strip().upper() for x in payload.block_on_status if str(x).strip()]
        if not statuses:
            raise HTTPException(status_code=400, detail="block_on_status cannot be empty")
        cfg["guardrails"]["block_on_status"] = statuses
        cfg["guardrails"]["rules"] = [
            {"enabled": True, "condition": s, "action": "BLOCK", "message": ""} for s in statuses
        ]

    save_runtime_config(cfg)
    return {"ok": True, "guardrails": cfg["guardrails"]}


@router.post("/agents")
def update_agents(payload: AgentsConfigUpdate, _=Depends(get_current_user)):
    cfg = load_runtime_config()
    cfg.setdefault("agents", {})
    cfg["agents"]["mine"] = payload.mine
    cfg["agents"]["bank"] = payload.bank
    save_runtime_config(cfg)
    return {"ok": True, "agents": cfg["agents"]}
