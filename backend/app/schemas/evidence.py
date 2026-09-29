from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

class EvidenceBase(BaseModel):
    evidenceId: str
    eventId: Optional[str] = None
    sourceType: str
    sourceDocumentId: Optional[str] = None
    snippet: Optional[str] = None
    pageLocation: Optional[str] = None
    verificationStatus: str = "pending"
    fieldPath: str

class EvidenceCreate(EvidenceBase):
    pass

class EvidenceResponse(EvidenceBase):
    class Config:
        from_attributes = True
