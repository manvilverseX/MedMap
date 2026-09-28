import os
import uuid
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from passlib.context import CryptContext

def seed_doctor():
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD")
    if not admin_password:
        raise ValueError("INITIAL_ADMIN_PASSWORD environment variable is missing or empty. Please set it to a strong password before seeding.")

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
    else:
        print("Doctor user already exists. Skipping seed.")
    db.close()

if __name__ == "__main__":
    seed_doctor()
