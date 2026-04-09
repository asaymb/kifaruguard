import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from backend.app.core.security import create_access_token, verify_password
from backend.app.db.models import User
from backend.app.db.session import get_db
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.username == payload.username).first()
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"access_token": create_access_token(user.username), "token_type": "bearer"}
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Database error during login")
        raise HTTPException(status_code=503, detail="Database unavailable")
    except Exception:
        logger.exception("Unexpected login error")
        raise HTTPException(status_code=500, detail="Login failed")
