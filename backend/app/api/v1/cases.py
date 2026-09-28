from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse, CaseStatus
from app.services import case_service
from app.core.database import get_db
from fastapi import UploadFile, File, Form
from app.schemas.document import DocumentResponse
from app.services import document_service
from app.core.security import require_doctor, require_patient_or_doctor, create_access_token
from typing import Dict, Any

router = APIRouter()

@router.post("", status_code=201)
@router.post("/", status_code=201)
def create_case(case_in: CaseCreate, db: Session = Depends(get_db)):
    if case_in.consentGranted is not True:
        raise HTTPException(status_code=400, detail="Explicit consent is required to create a case")
    case_response = case_service.create_case(db, case_in)
    access_token = create_access_token(data={"role": "patient", "case_id": case_response.caseId})
    return {"case": case_response, "token": access_token}

@router.get("", response_model=List[CaseResponse])
@router.get("/", response_model=List[CaseResponse])
def get_cases(status: Optional[CaseStatus] = Query(None), db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_doctor)):
    status_val = status.value if status else None
    return case_service.get_cases(db, status=status_val)

@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@router.put("/{case_id}", response_model=CaseResponse)
def update_case(case_id: str, case_in: CaseUpdate, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    current_case = case_service.get_case(db, case_id)
    if not current_case:
        raise HTTPException(status_code=404, detail="Case not found")

    provided_fields = case_in.model_dump(exclude_unset=True).keys()

    if current_user.get("role") == "patient":
        if current_user.get("case_id") != case_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this case")
        if case_in.status == CaseStatus.COMPLETED:
            raise HTTPException(status_code=403, detail="Patients cannot mark case as completed")

        if "clinicalAssessment" in provided_fields or "reviewerId" in provided_fields:
            raise HTTPException(status_code=403, detail="Patients cannot modify doctor review fields")

    elif current_user.get("role") == "doctor":
        update_data = case_in.model_dump(exclude_unset=True)
        # Prevent client from spoofing reviewerId
        if "reviewerId" in update_data:
            del update_data["reviewerId"]

        if "clinicalAssessment" in provided_fields:
            update_data["reviewerId"] = current_user.get("sub")

        case_in = CaseUpdate(**update_data)

    if case_in.status and case_in.status != current_case.status:
        valid_transitions = {
            CaseStatus.INTAKE: [CaseStatus.PATIENT_VERIFYING],
            CaseStatus.PATIENT_VERIFYING: [CaseStatus.DOCTOR_REVIEW],
            CaseStatus.DOCTOR_REVIEW: [CaseStatus.COMPLETED],
            CaseStatus.COMPLETED: []
        }

        allowed_next_states = valid_transitions.get(CaseStatus(current_case.status), [])
        if case_in.status not in allowed_next_states:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid state transition from {current_case.status} to {case_in.status.value}"
            )

    case = case_service.update_case(db, case_id, case_in)
    return case

@router.post("/{case_id}/documents", response_model=DocumentResponse, status_code=201)
def upload_case_document(
    case_id: str,
    file: Optional[UploadFile] = File(None),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this case")

    if metadata:
        import json
        from pydantic import BaseModel
        class BlobMetadata(BaseModel):
            url: str
            pathname: str
            filename: str
            mimeType: str
            sizeBytes: int

        try:
            meta_dict = json.loads(metadata)
            meta_obj = BlobMetadata(**meta_dict)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid metadata format")

        return document_service.save_document_metadata(db, case_id, meta_obj)

    if file:
        return document_service.upload_document(db, case_id, file)

    raise HTTPException(status_code=400, detail="Must provide file or metadata")

@router.get("/{case_id}/documents", response_model=List[DocumentResponse])
def get_case_documents(case_id: str, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access these documents")
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return document_service.get_documents(db, case_id)
