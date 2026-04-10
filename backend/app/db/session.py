from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.config import DATABASE_URL

_engine_kw: dict = {"pool_pre_ping": True, "pool_recycle": 300}
if DATABASE_URL.startswith("sqlite") and ":memory:" in DATABASE_URL:
    # TestClient + FastAPI use multiple threads; StaticPool keeps a single shared in-memory connection.
    _engine_kw = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}

engine = create_engine(DATABASE_URL, **_engine_kw)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
