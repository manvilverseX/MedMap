from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime
from app.schemas.evidence import EvidenceResponse

class UnifiedClinicalEventBase(BaseModel):
    eventId: str
    caseId: str
    eventType: str
    eventDate: Optional[datetime] = None
    details: Dict[str, Any]
    status: str = "pending"

class UnifiedClinicalEventCreate(UnifiedClinicalEventBase):
    pass

class UnifiedClinicalEventResponse(UnifiedClinicalEventBase):
    class Config:
        from_attributes = True
