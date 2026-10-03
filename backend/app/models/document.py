from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from app.models.base import Base

class PatientDocument(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)
    caseId = Column(String, ForeignKey("cases.caseId"), index=True, nullable=False)
    filename = Column(String, nullable=False)
    storagePath = Column(String, nullable=False)
    mimeType = Column(String, nullable=False)
    sizeBytes = Column(Integer, nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False)
    extractedText = Column(String, nullable=True)
    extractionStatus = Column(String, nullable=True, default="pending")
    medicalEntities = Column(JSON, nullable=True)
    documentCategory = Column(String, nullable=True)
    v2ExtractionData = Column(JSON, nullable=True)
