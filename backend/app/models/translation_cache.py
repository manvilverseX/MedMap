from sqlalchemy import Column, String, DateTime
from app.models.base import Base


class TranslationCache(Base):
    __tablename__ = "translation_cache"

    source_text_hash = Column(String(64), primary_key=True, nullable=False)
    target_lang = Column(String(8), primary_key=True, nullable=False)
    translated_text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
