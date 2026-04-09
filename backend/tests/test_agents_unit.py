from backend.app.agents.bank_agent import run_bank_agent
from backend.app.agents.mine_agent import run_mine_agent


def test_mine_agent_blocks_blacklisted_country(tmp_path):
    csv_file = tmp_path / "mines.csv"
    csv_file.write_text("country\niran\n", encoding="utf-8")

    text = "Mine Name: Alpha\nCountry: Iran\nWeight: 12"
    result = run_mine_agent(text, str(csv_file))
    assert result["status"] == "BLOCKED"


def test_bank_agent_reviews_flagged_company(tmp_path):
    csv_file = tmp_path / "bank.csv"
    csv_file.write_text("company_name\nacme holdings\n", encoding="utf-8")

    text = "Company Name: Acme Holdings\nRegistration Number: A-42"
    result = run_bank_agent(text, str(csv_file))
    assert result["status"] == "REVIEW"
