from fastapi.testclient import TestClient

from backend.app.main import app


def test_agents_requires_auth():
    client = TestClient(app)
    response = client.post("/agents/run", data={"agent_type": "mine", "file_path": "/tmp/missing.pdf"})
    assert response.status_code in {401, 403}
