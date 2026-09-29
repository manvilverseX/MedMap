from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any, Dict

class DocumentResponse(BaseModel):
    id: str
    caseId: str
    filename: str
    mimeType: str
    sizeBytes: int
    createdAt: datetime
    extractedText: Optional[str] = None
    extractionStatus: Optional[str] = None
    medicalEntities: Optional[Dict[str, Any]] = None
    documentCategory: Optional[str] = None
    v2ExtractionData: Optional[Dict[str, Any]] = None
