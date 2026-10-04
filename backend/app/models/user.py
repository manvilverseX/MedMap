from sqlalchemy import Column, String, DateTime
from app.models.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'doctor'

class TokenBlocklist(Base):
    __tablename__ = "token_blocklist"
    token = Column(String, primary_key=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
