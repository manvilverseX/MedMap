import os
import uuid
import shutil
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException
from app.models.document import PatientDocument
from app.models.case import ClinicalCase
from app.schemas.document import DocumentResponse

UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIMES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
MAX_SIZE = 10 * 1024 * 1024

def upload_document(db: Session, case_id: str, file: UploadFile) -> DocumentResponse:
    # Validate case
    case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    doc_id = str(uuid.uuid4())
    safe_filename = f"{doc_id}{ext}"

    # Read and validate size in memory
    size_bytes = 0
    file_content = b""
    while True:
        chunk = file.file.read(8192)
        if not chunk:
            break
        size_bytes += len(chunk)
        if size_bytes > MAX_SIZE:
            raise HTTPException(status_code=400, detail="File too large")
        file_content += chunk
    
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
    
    if blob_token:
        # Vercel Blob Storage (Private)
        blob_api_url = f"https://blob.vercel-storage.com/{safe_filename}"
        headers = {
            "authorization": f"Bearer {blob_token}",
            "x-api-version": "7",
            "x-access": "private",
            "x-content-type": file.content_type
        }
        resp = requests.put(blob_api_url, headers=headers, data=file_content)
        if not resp.ok:
            raise HTTPException(status_code=500, detail="Failed to upload document to cloud storage")
        blob_url = resp.json().get("url")
        storage_path = blob_url
    else:
        if os.getenv("VERCEL") == "1":
            raise HTTPException(status_code=500, detail="Server misconfiguration: Vercel Blob token is missing.")
            
        # Local Fallback
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        storage_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(storage_path, "wb") as f:
            f.write(file_content)

    # Create DB record
    db_doc = PatientDocument(
        id=doc_id,
        caseId=case_id,
        filename=os.path.basename(file.filename),
        storagePath=storage_path,
        mimeType=file.content_type,
        sizeBytes=size_bytes,
        createdAt=datetime.now(timezone.utc)
    )
    
    try:
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
    except Exception as e:
        db.rollback()
        # Clean up local file if it was a local upload
        if not blob_token and os.path.exists(storage_path):
            os.remove(storage_path)
        raise e

    return DocumentResponse(
        id=db_doc.id,
        caseId=db_doc.caseId,
        filename=db_doc.filename,
        mimeType=db_doc.mimeType,
        sizeBytes=db_doc.sizeBytes,
        createdAt=db_doc.createdAt
    )

def get_documents(db: Session, case_id: str) -> list[DocumentResponse]:
    docs = db.query(PatientDocument).filter(PatientDocument.caseId == case_id).order_by(PatientDocument.createdAt.desc()).all()
    return [
        DocumentResponse(
            id=d.id,
            caseId=d.caseId,
            filename=d.filename,
            mimeType=d.mimeType,
            sizeBytes=d.sizeBytes,
            createdAt=d.createdAt
        ) for d in docs
    ]
