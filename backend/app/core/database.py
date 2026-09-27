import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

load_dotenv()
from sqlalchemy.orm import sessionmaker

preview_url = os.getenv("MEDMAP_PREVIEW_DATABASE_URL")
db_url = os.getenv("DATABASE_URL")
medmap_url = os.getenv("MEDMAP_DATABASE_URL")

if preview_url and preview_url.startswith("postgres"):
    raw_url = preview_url
elif db_url and db_url.startswith("postgres"):
    raw_url = db_url
elif medmap_url and medmap_url.startswith("postgres"):
    raw_url = medmap_url
else:
    raw_url = "postgresql://postgres:PASSWORD_PLACEHOLDER@localhost:5432/medmap"

if raw_url.startswith("postgresql://"):
    DATABASE_URL = raw_url.replace("postgresql://", "postgresql+pg8000://", 1)
elif raw_url.startswith("postgresql+psycopg2://"):
    DATABASE_URL = raw_url.replace("postgresql+psycopg2://", "postgresql+pg8000://", 1)
elif raw_url.startswith("postgres://"):
    DATABASE_URL = raw_url.replace("postgres://", "postgresql+pg8000://", 1)
else:
    DATABASE_URL = raw_url

DATABASE_URL = DATABASE_URL.replace("?channel_binding=require&", "?")
DATABASE_URL = DATABASE_URL.replace("&channel_binding=require", "")
DATABASE_URL = DATABASE_URL.replace("?channel_binding=require", "")

connect_args = {}
if "sslmode=require" in DATABASE_URL:
    import ssl
    DATABASE_URL = DATABASE_URL.replace("?sslmode=require&", "?")
    DATABASE_URL = DATABASE_URL.replace("&sslmode=require", "")
    DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "")
    connect_args["ssl_context"] = ssl.create_default_context()

engine = create_engine(DATABASE_URL, poolclass=NullPool, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
