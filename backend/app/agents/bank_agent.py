import json
import re
from backend.app.agents.sanctions import load_column_values
from backend.app.core.llm import generate

def run_bank_agent(text: str, sanctions_csv: str) -> dict:
    company = re.search(r"company\s*name[:\-]\s*(.+)", text, re.IGNORECASE)
    reg = re.search(r"registration\s*number[:\-]\s*(.+)", text, re.IGNORECASE)
    data = {
        "company_name": company.group(1).strip() if company else None,
        "registration_number": reg.group(1).strip() if reg else None,
    }
    if not data["company_name"] or not data["registration_number"]:
        try:
            data = json.loads(generate("Extract company_name,registration_number JSON only:\n" + text[:4000]))
        except Exception:
            pass
    status = "REVIEW" if (data.get("company_name") or "").strip().lower() in load_column_values(sanctions_csv, "company_name") else "APPROVED"
    return {"status": status, "data": data}
