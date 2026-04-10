import os

# Required before importing the app — startup validates these (production hardening).
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-must-be-non-empty-for-ci")
os.environ.setdefault("AUDIT_HMAC_SECRET", "test-audit-hmac-secret-must-be-non-empty")
os.environ.setdefault("ALLOWED_ORIGINS", "http://testserver")
# In-memory SQLite for tests (no Postgres required; avoids broken local DSNs).
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"

from fastapi.testclient import TestClient

from backend.app.main import app


def test_client():
    return TestClient(app)
