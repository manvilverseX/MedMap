import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Dict, Any

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is missing. It is required for security.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days for prototype convenience

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/doctor/login")

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role not in ["patient", "doctor"]:
            raise credentials_exception
            
        if role == "patient" and not payload.get("case_id"):
            raise credentials_exception
            
        return payload
    except jwt.PyJWTError:
        raise credentials_exception

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
    if role not in ["patient", "doctor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted"
        )
    return current_user
