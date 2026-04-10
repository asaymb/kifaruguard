from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    agent_type = Column(String(50), nullable=False)
    step = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    input_text = Column(Text)
    output_text = Column(Text)
    status = Column(String(50), default="ok", nullable=False)
    # Ties each line to one /agents/run response (same id as API and HITL).
    run_id = Column(String(64), nullable=True, index=True)


class HitlQueue(Base):
    __tablename__ = "hitl_queue"
    id = Column(Integer, primary_key=True, index=True)
    agent_type = Column(String(50), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Correlates queue rows to a single /agents/run invocation (minimal traceability, no orchestrator refactor).
    run_id = Column(String(64), nullable=True, index=True)
    # Agent outcome that triggered HITL (e.g. REVIEW), distinct from queue workflow status (pending/approved).
    agent_result_status = Column(String(50), nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
