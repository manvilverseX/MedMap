from sqlalchemy import Column, String, ForeignKey
from app.models.base import Base

class Evidence(Base):
    __tablename__ = "evidence"
    
    evidenceId = Column(String, primary_key=True, index=True)
    eventId = Column(String, ForeignKey("clinical_events.eventId"), index=True, nullable=True)
    sourceType = Column(String, nullable=False)
    sourceDocumentId = Column(String, ForeignKey("documents.id"), nullable=True)
    snippet = Column(String, nullable=True)
    pageLocation = Column(String, nullable=True)
    verificationStatus = Column(String, nullable=False, default="pending")
    fieldPath = Column(String, nullable=False)
