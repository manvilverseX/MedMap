import os
import json
import base64
import urllib.request
from sqlalchemy.orm import Session
from app.models.document import PatientDocument
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from typing import Optional, List, Dict, Any
from groq import Groq

# Define the Structured Schema for Extraction
class ExtractedMedication(BaseModel):
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    duration: Optional[str] = None
    status: Optional[str] = None

class ExtractedInvestigation(BaseModel):
    testName: str
    value: str
    unit: Optional[str] = None
    referenceRange: Optional[str] = None
    abnormalFlag: Optional[bool] = None

class ExtractedMedicalEntities(BaseModel):
    medications: List[ExtractedMedication] = []
    diagnoses: List[str] = []
    investigations: List[ExtractedInvestigation] = []
    procedures: List[str] = []
    clinicallyRelevantDates: List[str] = []
    summary: Optional[str] = None
    sourceReference: str

def get_image_base64(storage_path: str) -> Optional[str]:
    try:
        if storage_path.startswith("http://") or storage_path.startswith("https://"):
            headers = {'User-Agent': 'Mozilla/5.0'}
            # If it's a Vercel Blob, we need to pass the BLOB_READ_WRITE_TOKEN to access private blobs
            blob_token = os.getenv("BLOB_READ_WRITE_TOKEN") or os.getenv("VERCEL_OIDC_TOKEN")
            if blob_token and "vercel-storage.com" in storage_path:
                headers['Authorization'] = f"Bearer {blob_token}"
                
            req = urllib.request.Request(storage_path, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                img_data = response.read()
        else:
            with open(storage_path, "rb") as f:
                img_data = f.read()
        return base64.b64encode(img_data).decode('utf-8')
    except Exception:
        return None

def process_document(db: Session, case_id: str, document_id: str):
    doc = db.query(PatientDocument).filter(
        PatientDocument.id == document_id, 
        PatientDocument.caseId == case_id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc.extractionStatus = "processing"
    db.commit()
    db.refresh(doc)
    
    # Verify supported format
    supported_image_mimes = {"image/png", "image/jpeg", "image/webp", "image/jpg"}
    if doc.mimeType not in supported_image_mimes:
        doc.extractionStatus = "unsupported"
        db.commit()
        db.refresh(doc)
        return doc
        
    # Enforce maximum extraction size (10 MB, consistent with upload)
    MAX_EXTRACTION_SIZE = 10 * 1024 * 1024
    if doc.sizeBytes > MAX_EXTRACTION_SIZE:
        doc.extractionStatus = "failed"
        db.commit()
        db.refresh(doc)
        return doc
        
    img_b64 = get_image_base64(doc.storagePath)
    if not img_b64:
        doc.extractionStatus = "failed"
        db.commit()
        db.refresh(doc)
        return doc

    api_key = os.getenv("GROQ_API_KEY")
    model_name = os.getenv("GROQ_DOCUMENT_MODEL", "qwen/qwen3.8-27b")
    client = Groq(api_key=api_key)
    
    schema_dict = ExtractedMedicalEntities.model_json_schema()
    
    prompt = f"""
    You are a medical document extraction assistant.
    Read the provided document image and extract the clinical information into JSON format.
    
    IMPORTANT CLINICAL SAFETY REQUIREMENTS:
    - Extract ONLY what is visibly and explicitly documented in the source image.
    - NEVER invent, infer, or diagnose missing clinical information.
    - NEVER infer a missing dose or condition from a medication.
    - NEVER convert uncertain handwriting into confident clinical facts.
    - Preserve ambiguity and conflicting values.
    - Use null or empty lists when information is not explicitly present.
    - Set sourceReference to "{doc.id}".
    
    Ensure your output exactly matches this JSON schema:
    {json.dumps(schema_dict, indent=2)}
    """
    
    mime_type_for_data_uri = doc.mimeType if doc.mimeType != "image/jpg" else "image/jpeg"
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': prompt},
                    {'type': 'image_url', 'image_url': {'url': f'data:{mime_type_for_data_uri};base64,{img_b64}'}}
                ]
            }],
            response_format={'type': 'json_object'},
            timeout=30.0  # 30 second timeout for model extraction
        )
        
        result_text = response.choices[0].message.content
        if not result_text:
            raise ValueError("Empty response")
            
        # Validate schema
        validated_entities = ExtractedMedicalEntities.model_validate_json(result_text)
        
        # Ensure sourceReference matches
        if validated_entities.sourceReference != doc.id:
            validated_entities.sourceReference = doc.id
            
        doc.medicalEntities = validated_entities.model_dump()
        doc.extractedText = validated_entities.summary or "Extracted via vision model"
        doc.extractionStatus = "completed"
        
    except ValidationError:
        doc.extractionStatus = "failed"
    except Exception:
        doc.extractionStatus = "failed"
        
    db.commit()
    db.refresh(doc)
    return doc
