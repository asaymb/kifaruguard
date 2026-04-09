import json
import re
from backend.app.agents.sanctions import load_column_values
from backend.app.core.llm import generate

def run_mine_agent(text: str, sanctions_csv: str) -> dict:
    mine_name = re.search(r"mine\s*name[:\-]\s*(.+)", text, re.IGNORECASE)
    country = re.search(r"country[:\-]\s*(.+)", text, re.IGNORECASE)
    weight = re.search(r"weight[:\-]\s*([\d.]+)", text, re.IGNORECASE)
    data = {
        "mine_name": mine_name.group(1).strip() if mine_name else None,
        "country": country.group(1).strip() if country else None,
        "weight": float(weight.group(1)) if weight else None,
    }
    if not data["mine_name"] or not data["country"]:
        try:
            data = json.loads(generate("Extract mine_name,country,weight JSON only:\n" + text[:4000]))
        except Exception:
            pass
    status = "BLOCKED" if (data.get("country") or "").strip().lower() in load_column_values(sanctions_csv, "country") else "OK"
    return {"status": status, "data": data}
