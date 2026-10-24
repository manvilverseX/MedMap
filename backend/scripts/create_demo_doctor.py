#!/usr/bin/env python3
"""
Idempotent script to create or reset the dedicated demo doctor user 'demo_doctor'.
Requirements:
- Only touches the 'demo_doctor' user; refuses to modify or delete any other user.
- Reads DATABASE_URL and DEMO_DOCTOR_PASSWORD from environment.
- Never prints or logs the password.
- Only when DATABASE_URL is local/sqlite may it fall back to a documented local default.
- On any non-local database, exits non-zero if DEMO_DOCTOR_PASSWORD is not set.
- With --reset-password, updates the existing user's password.
"""

import os
import sys
import argparse
import uuid
from passlib.context import CryptContext

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, DATABASE_URL
from app.models.user import User

LOCAL_DEMO_DOCTOR_PASSWORD = "demo_doctor_password123"

def is_local_db() -> bool:
    url_lower = str(DATABASE_URL).lower()
    return "sqlite" in url_lower or "localhost" in url_lower or "127.0.0.1" in url_lower

def main():
    parser = argparse.ArgumentParser(description="Create or reset the demo_doctor user.")
    parser.add_argument("--reset-password", action="store_true", help="Reset password if demo_doctor already exists.")
    args = parser.parse_args()

    password = os.getenv("DEMO_DOCTOR_PASSWORD")
    if not password:
        if is_local_db():
            password = LOCAL_DEMO_DOCTOR_PASSWORD
            print("Local database detected: using documented local default password for demo_doctor.")
        else:
            print("ERROR: DEMO_DOCTOR_PASSWORD environment variable is missing on non-local database. Refusing to create or update demo_doctor.", file=sys.stderr)
            sys.exit(1)

    db = SessionLocal()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    try:
        user = db.query(User).filter(User.username == "demo_doctor").first()
        if user:
            if args.reset_password:
                user.hashed_password = pwd_context.hash(password)
                user.role = "doctor"
                db.commit()
                print("SUCCESS: demo_doctor password has been successfully reset.")
            else:
                print("NOTICE: demo_doctor already exists. Use --reset-password to update password.")
        else:
            new_user = User(
                id=str(uuid.uuid4()),
                username="demo_doctor",
                hashed_password=pwd_context.hash(password),
                role="doctor"
            )
            db.add(new_user)
            db.commit()
            print("SUCCESS: demo_doctor created with role 'doctor'.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
