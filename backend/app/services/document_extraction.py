import os
import json
import base64
import logging
import io
import urllib.request
import urllib.parse
from sqlalchemy.orm import Session
from app.models.document import PatientDocument
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from typing import Optional, List, Dict, Any
from groq import Groq
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

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

def get_image_slices_base64(storage_path: str, document_id: str = "unknown") -> Optional[List[str]]:
    try:
        if storage_path.startswith("http://") or storage_path.startswith("https://"):
            headers = {'User-Agent': 'Mozilla/5.0'}

            # If it's a Vercel Blob in a deployed environment
            if "vercel-storage.com" in storage_path:
                blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
                if blob_token:
                    headers["Authorization"] = f"Bearer {blob_token}"
                else:
                    vercel_url = os.getenv("VERCEL_URL")
                    secret_key = os.getenv("SECRET_KEY")
                    if vercel_url and secret_key:
                        storage_path = f"https://{vercel_url}/api/blob-read?url={urllib.parse.quote(storage_path)}"
                        headers['x-internal-auth'] = secret_key

            req = urllib.request.Request(storage_path, headers=headers)

            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    if response.status != 200:
                        body = response.read().decode('utf-8', errors='ignore')
                        raise Exception(f"HTTP {response.status} Error fetching blob: {body}")
                    img_data = response.read()
            except urllib.error.HTTPError as e:
                body = e.read().decode('utf-8', errors='ignore')
                raise Exception(f"HTTP {e.code} Error fetching blob: {body}")
        else:
            with open(storage_path, "rb") as f:
                img_data = f.read()

        # Slice the image using Pillow
        image = Image.open(io.BytesIO(img_data))

        # Handle EXIF orientation
        image = ImageOps.exif_transpose(image)

        # Convert to RGB if it's RGBA or P to avoid issues when saving to JPEG
        if image.mode in ('RGBA', 'P'):
            image = image.convert('RGB')

        width, height = image.size

        # 3 slices with 10% overlap
        slice_height = int(height / 3)
        overlap = int(height * 0.1)

        slices = []
        # Slice 1 (Top)
        bottom1 = slice_height + overlap
        slices.append(image.crop((0, 0, width, min(bottom1, height))))

        # Slice 2 (Middle)
        top2 = slice_height - overlap
        bottom2 = (slice_height * 2) + overlap
        slices.append(image.crop((0, max(0, top2), width, min(bottom2, height))))

        # Slice 3 (Bottom)
        top3 = (slice_height * 2) - overlap
        bottom3 = height
        slices.append(image.crop((0, max(0, top3), width, min(bottom3, height))))

        base64_slices = []
        for img_slice in slices:
            buffer = io.BytesIO()
            img_slice.save(buffer, format="JPEG", quality=85)
            b64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
            base64_slices.append(b64_str)

        return base64_slices
    except Exception as e:
        logger.exception(f"Blob retrieval failed for document {document_id}. Path: {storage_path}. Exception: {type(e).__name__} - {str(e)}")
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

    img_b64_slices = get_image_slices_base64(doc.storagePath, doc.id)
    if not img_b64_slices:
        doc.extractionStatus = "failed"
        doc.extractedText = "Extraction error: Failed to retrieve or process image slices."
        db.commit()
        db.refresh(doc)
        return doc

    api_key = os.getenv("GROQ_API_KEY")
    model_name = os.getenv("GROQ_DOCUMENT_MODEL", "llama-3.2-11b-vision-preview")
    client = Groq(api_key=api_key)

    schema_dict = ExtractedMedicalEntities.model_json_schema()

    prompt = f"""
    You are a medical document extraction assistant.
    You have been provided a vertically cropped portion (a slice) of a medical document image.
    Read the provided cropped image and extract the clinical information visibly present in this specific slice into JSON format.

    IMPORTANT CLINICAL SAFETY REQUIREMENTS:
    - Extract ONLY what is visibly and explicitly documented in this cropped image.
    - NEVER invent, infer, or diagnose missing clinical information.
    - NEVER infer a missing dose or condition from a medication.
    - NEVER convert uncertain handwriting into confident clinical facts.
    - Preserve ambiguity and conflicting values.
    - Use null or empty lists when information is not explicitly present in this slice.
    - Set sourceReference to "{doc.id}".

    Ensure your output exactly matches this JSON schema:
    {json.dumps(schema_dict, indent=2)}
    """

    mime_type_for_data_uri = "image/jpeg"

    try:
        merged_entities = ExtractedMedicalEntities(sourceReference=doc.id)

        for idx, img_b64 in enumerate(img_b64_slices):
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
                max_tokens=330,
                timeout=30.0  # 30 second timeout for model extraction
            )

            result_text = response.choices[0].message.content
            if not result_text:
                raise ValueError(f"Empty response for slice {idx}")

            # Validate schema
            slice_entities = ExtractedMedicalEntities.model_validate_json(result_text)

            merged_entities.diagnoses.extend(slice_entities.diagnoses)
            merged_entities.procedures.extend(slice_entities.procedures)
            merged_entities.clinicallyRelevantDates.extend(slice_entities.clinicallyRelevantDates)

            if slice_entities.summary:
                if merged_entities.summary:
                    merged_entities.summary += " " + slice_entities.summary
                else:
                    merged_entities.summary = slice_entities.summary

            merged_entities.medications.extend(slice_entities.medications)
            merged_entities.investigations.extend(slice_entities.investigations)

        # Deduplicate strings exactly
        merged_entities.diagnoses = list(dict.fromkeys(merged_entities.diagnoses))
        merged_entities.procedures = list(dict.fromkeys(merged_entities.procedures))
        merged_entities.clinicallyRelevantDates = list(dict.fromkeys(merged_entities.clinicallyRelevantDates))

        # Deduplicate models exactly
        def deduplicate_models(model_list):
            seen = set()
            deduped = []
            for m in model_list:
                m_str = json.dumps(m.model_dump(), sort_keys=True)
                if m_str not in seen:
                    seen.add(m_str)
                    deduped.append(m)
            return deduped

        merged_entities.medications = deduplicate_models(merged_entities.medications)
        merged_entities.investigations = deduplicate_models(merged_entities.investigations)

        # Ensure sourceReference matches
        if merged_entities.sourceReference != doc.id:
            merged_entities.sourceReference = doc.id

        doc.medicalEntities = merged_entities.model_dump()
        doc.extractedText = merged_entities.summary or "Extracted via vision model"
        doc.extractionStatus = "completed"

    except ValidationError as e:
        logger.exception(f"Validation failed during extraction for document {doc.id}. Model: {model_name}. MIME: {doc.mimeType}. Size: {doc.sizeBytes}. Exception: {type(e).__name__} - {str(e)}")
        doc.extractionStatus = "failed"
        doc.extractedText = f"Extraction error: Validation failed - {str(e)}"
    except Exception as e:
        logger.exception(f"Groq/extraction processing failed for document {doc.id}. Model: {model_name}. MIME: {doc.mimeType}. Size: {doc.sizeBytes}. Exception: {type(e).__name__} - {str(e)}")
        doc.extractionStatus = "failed"
        doc.extractedText = f"Extraction error: {type(e).__name__} - {str(e)}"

    db.commit()
    db.refresh(doc)
    return doc
