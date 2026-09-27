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

    is_vercel = os.getenv("VERCEL") == "1"
    
    if os.getenv("BLOB_READ_WRITE_TOKEN") or is_vercel:
        import time
        import logging
        import urllib.parse
        import random
        
        token = os.getenv("BLOB_READ_WRITE_TOKEN")
        store_id = os.getenv("BLOB_STORE_ID")
        
        headers = {
            "x-api-version": "7",
            "x-vercel-blob-access": "private",
            "x-add-random-suffix": "0"
        }
        
        if file.content_type:
            headers["x-content-type"] = file.content_type
            
        try:
            if token:
                headers["authorization"] = f"Bearer {token}"
            elif is_vercel and store_id:
                # Normalize store_id as per official SDK:
                # remove "store_" prefix if present
                if store_id.startswith("store_"):
                    store_id = store_id[6:]
                
                from vercel.oidc import get_vercel_oidc_token_sync
                oidc_token = get_vercel_oidc_token_sync()
                headers["authorization"] = f"Bearer {oidc_token}"
                headers["x-vercel-blob-store-id"] = store_id
                
                # Match JS request ID format: storeId:Date.now():Math.random()
                timestamp = int(time.time() * 1000)
                random_hex = format(random.getrandbits(48), 'x')
                request_id = f"{store_id}:{timestamp}:{random_hex}"
                headers["x-api-blob-request-id"] = request_id
                headers["x-api-blob-request-attempt"] = "0"
            else:
                raise ValueError("Missing both BLOB_READ_WRITE_TOKEN and BLOB_STORE_ID")

            blob_api_url = "https://vercel.com/api/blob"
            resp = requests.put(
                blob_api_url,
                params={"pathname": safe_filename},
                headers=headers,
                data=file_content
            )
            resp.raise_for_status()
            
            # The Vercel API returns the uploaded url in the JSON response
            storage_path = resp.json().get("url")
            
        except Exception as e:
            logging.error(f"Blob upload failed: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to upload document to cloud storage")
    else:
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
        if not (os.getenv("BLOB_READ_WRITE_TOKEN") or os.getenv("VERCEL") == "1") and os.path.exists(storage_path):
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
