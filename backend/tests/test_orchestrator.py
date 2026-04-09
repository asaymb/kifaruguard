from backend.app.agents.orchestrator import run_state_machine


def test_orchestrator_transitions_and_returns_result(tmp_path):
    mines = tmp_path / "mines.csv"
    bank = tmp_path / "bank.csv"
    mines.write_text("country\niran\n", encoding="utf-8")
    bank.write_text("company_name\nacme holdings\n", encoding="utf-8")

    logs = []

    def logger(agent_type, step, input_text, output_text, status):
        logs.append(step)

    result = run_state_machine("mine", "Mine Name: A\nCountry: Iran\nWeight: 1", str(mines), str(bank), logger)
    assert result["status"] == "BLOCKED"
    assert logs == ["START", "PARSE_DOCUMENT", "EXTRACT_DATA", "CHECK_RULES", "DECISION", "END"]
