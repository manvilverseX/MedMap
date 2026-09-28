from pydantic import BaseModel
from datetime import datetime

class DocumentResponse(BaseModel):
    id: str
    caseId: str
    filename: str
    mimeType: str
    sizeBytes: int
    createdAt: datetime
