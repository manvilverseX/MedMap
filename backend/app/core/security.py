import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Dict, Any, Optional

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is missing. It is required for security.")

ALGORITHM = "HS256"
# Token lifetimes: patient 4 hours (240 min), doctor and admin 12 hours (720 min)
ACCESS_TOKEN_EXPIRE_MINUTES_PATIENT = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES_PATIENT", str(60 * 4)))
ACCESS_TOKEN_EXPIRE_MINUTES_STAFF = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES_STAFF", str(60 * 12)))
ACCESS_TOKEN_EXPIRE_MINUTES = ACCESS_TOKEN_EXPIRE_MINUTES_STAFF

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/doctor/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/doctor/login", auto_error=False)

import uuid

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        role = to_encode.get("role")
        if role == "patient":
            expire_minutes = ACCESS_TOKEN_EXPIRE_MINUTES_PATIENT
        else:
            expire_minutes = ACCESS_TOKEN_EXPIRE_MINUTES_STAFF
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode.update({"exp": expire, "jti": str(uuid.uuid4())})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.core.database import get_db
from app.models.user import TokenBlocklist

logger = logging.getLogger(__name__)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role not in ["patient", "doctor", "admin"]:
            raise credentials_exception

        if role == "patient" and not payload.get("case_id"):
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    # Check if token is blocked
    try:
        is_blocked = db.query(TokenBlocklist).filter(TokenBlocklist.token == token).first()
        if is_blocked:
            raise credentials_exception
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        logger.error("Database error while checking token blocklist: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred during token revocation check"
        ) from exc

    return payload

def get_optional_current_user(token: Optional[str] = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role not in ["patient", "doctor", "admin"]:
            return None
        is_blocked = db.query(TokenBlocklist).filter(TokenBlocklist.token == token).first()
        if is_blocked:
            return None
        return payload
    except Exception:
        return None

def require_doctor(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user

def require_patient_or_doctor(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    # Validates that the user is either a patient or a doctor.
    # The actual case_id check for patients happens in the route handler.
    role = current_user.get("role")
    if role not in ["patient", "doctor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user

def require_doctor_or_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = current_user.get("role")
    if role not in ["doctor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user

def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user
