from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from app.models.base import Base

class UnifiedClinicalEvent(Base):
    __tablename__ = "clinical_events"
    
    eventId = Column(String, primary_key=True, index=True)
    caseId = Column(String, ForeignKey("cases.caseId"), index=True, nullable=False)
    eventType = Column(String, nullable=False)
    eventDate = Column(DateTime(timezone=True), nullable=True)
    details = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="pending")
