import os
import sys
import uuid
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, DATABASE_URL
from app.models.user import User
from passlib.context import CryptContext

LOCAL_DEMO_DOCTOR_PASSWORD = "demo_doctor_password123"

def is_local_db() -> bool:
    url_lower = str(DATABASE_URL).lower()
    return "sqlite" in url_lower or "localhost" in url_lower or "127.0.0.1" in url_lower

def seed_demo_doctor(db: Session = None):
    close_at_end = False
    if db is None:
        db = SessionLocal()
        close_at_end = True
    
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    password = os.getenv("DEMO_DOCTOR_PASSWORD")
    if not password:
        if is_local_db():
            password = LOCAL_DEMO_DOCTOR_PASSWORD
            print("Local database detected: using documented local default password for demo_doctor.")
        else:
            print("ERROR: DEMO_DOCTOR_PASSWORD environment variable is missing on non-local database. Refusing to seed demo_doctor.", file=sys.stderr)
            if close_at_end:
                db.close()
            sys.exit(1)

    existing = db.query(User).filter(User.username == "demo_doctor").first()
    if not existing:
        user = User(
            id=str(uuid.uuid4()),
            username="demo_doctor",
            hashed_password=pwd_context.hash(password),
            role="doctor"
        )
        db.add(user)
        db.commit()
        print("Dedicated demo doctor user ('demo_doctor') successfully seeded.")
    else:
        existing.hashed_password = pwd_context.hash(password)
        existing.role = "doctor"
        db.commit()
        print("Dedicated demo doctor user ('demo_doctor') already exists. Password updated.")
    
    if close_at_end:
        db.close()

def seed_doctor():
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD")
    if admin_password:
        db = SessionLocal()
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        if not db.query(User).filter(User.username == "doctor").first():
            user = User(
                id=str(uuid.uuid4()),
                username="doctor",
                hashed_password=pwd_context.hash(admin_password),
                role="doctor"
            )
            db.add(user)
            db.commit()
            print("Doctor user successfully seeded.")
        db.close()

if __name__ == "__main__":
    seed_demo_doctor()
    seed_doctor()

