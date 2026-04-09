import os
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


def create_mock_pdf(path: str, lines: list[str]):
    # Minimal PDF file for automated smoke checks.
    body = "\\n".join(lines)
    content = f"%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length {len(body)+50}>>stream\nBT /F1 12 Tf 20 250 Td ({body}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f\ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n9\n%%EOF"
    with open(path, "wb") as f:
        f.write(content.encode("latin1", errors="ignore"))


def main():
    login = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=10)
    login.raise_for_status()
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    mine_pdf = "mine_smoke.pdf"
    bank_pdf = "bank_smoke.pdf"
    create_mock_pdf(mine_pdf, ["Mine Name: Alpha", "Country: Kenya", "Weight: 10"])
    create_mock_pdf(bank_pdf, ["Company Name: Acme Holdings", "Registration Number: A1"])

    with open(mine_pdf, "rb") as f:
        r = requests.post(f"{BASE_URL}/agents/run", headers=headers, files={"file": ("mine.pdf", f, "application/pdf")}, data={"agent_type": "mine"}, timeout=20)
        print("mine_run", r.status_code, r.text)
        r.raise_for_status()

    with open(bank_pdf, "rb") as f:
        r = requests.post(f"{BASE_URL}/agents/run", headers=headers, files={"file": ("bank.pdf", f, "application/pdf")}, data={"agent_type": "bank"}, timeout=20)
        print("bank_run", r.status_code, r.text)
        r.raise_for_status()

    audit = requests.get(f"{BASE_URL}/audit?page=1&page_size=20", headers=headers, timeout=10)
    hitl = requests.get(f"{BASE_URL}/hitl?page=1&page_size=20", headers=headers, timeout=10)
    audit.raise_for_status()
    hitl.raise_for_status()
    audit_items = (audit.json() or {}).get("items", [])
    hitl_items = (hitl.json() or {}).get("items", [])
    print("audit", audit.status_code, f"items={len(audit_items)}")
    print("hitl", hitl.status_code, f"items={len(hitl_items)}")


if __name__ == "__main__":
    main()
