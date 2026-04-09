from fastapi.testclient import TestClient

from backend.app.main import app


def test_client():
    return TestClient(app)
