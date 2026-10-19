from typing import List, Optional, Dict, Any
import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Query, Header, UploadFile, File, Form
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse, CaseStatus
from app.schemas.intake import IntakeRequestMode, IntakeSessionState
from app.services import case_service
from pydantic import BaseModel
from app.core.database import get_db
from app.schemas.document import DocumentResponse
from app.services import document_service
from app.models.document import PatientDocument
from app.core.security import require_doctor, require_patient_or_doctor, require_doctor_or_admin, create_access_token
from app.services.audit_service import log_clinical_event, get_case_audit_trail, record_evidence_decision

router = APIRouter()

@router.post("", status_code=201)
@router.post("/", status_code=201)
def create_case(case_in: CaseCreate, db: Session = Depends(get_db)):
    if case_in.consentGranted is not True:
        raise HTTPException(status_code=400, detail="Explicit consent is required to create a case")
    case_response = case_service.create_case(db, case_in)
    access_token = create_access_token(data={"role": "patient", "case_id": case_response.caseId})

    # Record case creation & consent audit events
    log_clinical_event(db, case_response.caseId, "case_created", {"patientId": case_in.patientId, "consentGranted": True, "actor": "patient"})
    log_clinical_event(db, case_response.caseId, "consent_granted", {"consentGranted": True, "actor": "patient"})

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


@router.get("/{case_id}/adaptive-intake", response_model=IntakeSessionState)
def get_adaptive_intake_state(
    case_id: str,
    mode: Optional[IntakeRequestMode] = Query(None),
    question_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor),
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from app.services.adaptive_intake import select_intake_state

    try:
        return select_intake_state(
            case.intakeAnswers,
            mode=mode,
            question_id=question_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.put("/{case_id}", response_model=CaseResponse)
def update_case(case_id: str, case_in: CaseUpdate, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    current_case = case_service.get_case(db, case_id)
    if not current_case:
        raise HTTPException(status_code=404, detail="Case not found")

    provided_fields = case_in.model_dump(exclude_unset=True).keys()

    if "derivedClinicalData" in provided_fields:
        raise HTTPException(
            status_code=403,
            detail="Derived clinical data is server-controlled"
        )

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
            CaseStatus.DOCTOR_REVIEW: [CaseStatus.COMPLETED, CaseStatus.PATIENT_VERIFYING],
            CaseStatus.COMPLETED: []
        }

        allowed_next_states = valid_transitions.get(CaseStatus(current_case.status), [])
        if case_in.status not in allowed_next_states:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid state transition from {current_case.status} to {case_in.status.value}"
            )

    was_intake_completion = (
        current_case.status == CaseStatus.INTAKE.value and case_in.status == CaseStatus.PATIENT_VERIFYING
    )
    was_patient_verification = (
        case_in.status == CaseStatus.DOCTOR_REVIEW and current_case.status == CaseStatus.PATIENT_VERIFYING.value
    )

    if case_in.intakeAnswers is not None:
        from app.services.ai_service import validate_answer_with_llm
        from app.services.adaptive_intake import (
            INTAKE_QUESTIONS,
            sanitize_active_answers,
            validate_clinical_answer,
        )
        by_id = {q.id: q for q in INTAKE_QUESTIONS}

        # Invalidate / exclude dependent answers that are no longer eligible
        sanitized_answers, _ = sanitize_active_answers(case_in.intakeAnswers)
        case_in.intakeAnswers = sanitized_answers
        
        for q_id, answer in list(case_in.intakeAnswers.items()):
            if not isinstance(answer, str) or not answer.strip():
                continue
                
            old_record = current_case.intakeAnswers.get(q_id) if current_case.intakeAnswers else None
            old_answer = old_record.get("value") if isinstance(old_record, dict) else old_record
            attempts = int(old_record.get("clarification_attempts", 0)) if isinstance(old_record, dict) else 0

            if old_answer == answer:
                continue

            # Deterministic clinical validation
            needs_clar, clar_prompt = validate_clinical_answer(
                q_id,
                answer,
                previous_attempts=attempts,
            )

            # Optional LLM validation if deterministic passed on first attempt
            if not needs_clar and attempts == 0:
                try:
                    from app.services.interview_engine import CURATED_GAP_QUESTIONS
                    if q_id in by_id:
                        q_prompt = by_id[q_id].prompt
                    elif q_id in CURATED_GAP_QUESTIONS:
                        q_prompt = CURATED_GAP_QUESTIONS[q_id]["prompt"]
                    else:
                        q_prompt = "Patient answer:"
                    val = validate_answer_with_llm(q_prompt, answer)
                    if val.needs_clarification:
                        needs_clar = True
                        clar_prompt = val.clarifying_question or "Please clarify this answer."
                except Exception:
                    pass

            if needs_clar:
                case_in.intakeAnswers[q_id] = {
                    "value": answer,
                    "originalValue": answer,
                    "clarification_needed": clar_prompt or "Please clarify this answer.",
                    "clarification_attempts": attempts + 1,
                }

    case = case_service.update_case(db, case_id, case_in)

    # Feature Four: Structured medical history and human-in-the-loop provenance
    from app.services.adaptive_intake import build_structured_intake
    is_verified = (case.status in [CaseStatus.DOCTOR_REVIEW.value, CaseStatus.COMPLETED.value])
    structured = build_structured_intake(case.intakeAnswers or {}, verified=is_verified)

    derived = dict(current_case.derivedClinicalData or {})
    derived["structuredIntake"] = structured

    # Persist interview state and safety metadata
    from app.services.interview_engine import evaluate_emergency_safety
    from app.services.adaptive_intake import select_intake_state

    safety_check = evaluate_emergency_safety(case.intakeAnswers or {})
    if safety_check.is_escalated:
        from datetime import datetime, timezone
        derived["safetyEscalation"] = {
            "isEscalated": True,
            "severity": safety_check.severity,
            "title": safety_check.title,
            "message": safety_check.message,
            "instructions": safety_check.instructions,
            "redFlags": safety_check.red_flags,
            "escalatedAt": datetime.now(timezone.utc).isoformat(),
        }

    interview_session = select_intake_state(case.intakeAnswers or {}, enable_ai=False)
    derived["interviewState"] = {
        "status": interview_session.state.value,
        "completionReason": interview_session.completionReason,
        "questionsAnswered": len(interview_session.answeredQuestionIds),
        "clinicalProgress": interview_session.clinicalProgress.model_dump() if interview_session.clinicalProgress else None,
    }

    if was_patient_verification:
        from datetime import datetime, timezone
        derived["patientVerification"] = {
            "verified": True,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "patientId": current_case.patientId,
            "statement": "Patient confirmed self-reported intake responses."
        }
    elif case_in.intakeAnswers is not None and not is_verified:
        if "patientVerification" in derived:
            derived["patientVerification"]["verified"] = False
            derived["patientVerification"]["reverificationRequired"] = True

    case_service.update_derived_clinical_data(db, case_id, derived)
    case.derivedClinicalData = derived

    # Automatically generate AI summary on intake completion
    if was_intake_completion and not case.aiSummary and case.intakeAnswers:
        from app.services import ai_service
        try:
            summary_dict = ai_service.generate_clinical_brief(case.intakeAnswers)
            updated_case = case_service.update_ai_summary(db, case_id, summary_dict)
            if updated_case:
                case = updated_case
        except Exception as e:
            logging.error(f"Automatic AI summary generation failed: {e}")
    # Audit logging for case update events
    if case_in.intakeAnswers is not None:
        log_clinical_event(db, case_id, "answers_updated", {"answeredCount": len(case_in.intakeAnswers), "actor": current_user.get("role", "patient")})
    if was_patient_verification:
        log_clinical_event(db, case_id, "patient_verified", {"patientId": current_case.patientId, "actor": "patient"})
    if case_in.status == CaseStatus.COMPLETED and current_case.status != CaseStatus.COMPLETED.value:
        log_clinical_event(db, case_id, "case_finalized", {"reviewerId": current_user.get("sub"), "doctor": current_user.get("username", "doctor"), "actor": "doctor"})

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

@router.get("/{case_id}/documents/{document_id}/file")
def get_case_document_file(
    case_id: str,
    document_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split(" ", 1)[1]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.core.security import SECRET_KEY, ALGORITHM
    from app.models.user import TokenBlocklist
    import jwt

    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        role = payload.get("role")
        if role not in ["patient", "doctor"]:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        if role == "patient" and payload.get("case_id") != case_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this case")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    is_blocked = db.query(TokenBlocklist).filter(TokenBlocklist.token == auth_token).first()
    if is_blocked:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    doc = db.query(PatientDocument).filter(
        PatientDocument.id == document_id,
        PatientDocument.caseId == case_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.storagePath.startswith("http://") or doc.storagePath.startswith("https://"):
        return RedirectResponse(url=doc.storagePath)

    if not os.path.exists(doc.storagePath):
        raise HTTPException(status_code=404, detail="Document file not found on disk")

    return FileResponse(
        path=doc.storagePath,
        media_type=doc.mimeType,
        filename=doc.filename
    )


@router.post("/{case_id}/documents/{document_id}/extract", response_model=DocumentResponse)
def trigger_document_extraction(
    case_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")

    from app.services import document_extraction
    updated_doc = document_extraction.process_document(db, case_id, document_id)
    return updated_doc

@router.post("/{case_id}/ai-summary", response_model=CaseResponse)
def generate_case_ai_summary(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Idempotency
    if case.aiSummary:
        return case

    if not case.intakeAnswers:
        raise HTTPException(status_code=400, detail="Cannot generate AI summary: intake answers are empty")

    from app.services import ai_service
    from pydantic import ValidationError

    try:
        summary_dict = ai_service.generate_clinical_brief(case.intakeAnswers)
    except ValidationError:
        raise HTTPException(status_code=502, detail="AI generated malformed response")
    except ValueError as ve:
        raise HTTPException(status_code=500, detail=str(ve))
    except RuntimeError:
        raise HTTPException(status_code=502, detail="AI Generation Failed")
    except Exception:
        raise HTTPException(status_code=500, detail="An unexpected error occurred during AI generation")

    updated_case = case_service.update_ai_summary(db, case_id, summary_dict)
    if not updated_case:
        raise HTTPException(status_code=404, detail="Case not found during update")

    return updated_case

@router.get("/{case_id}/clinical-intelligence")
def get_clinical_intelligence(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    docs = document_service.get_documents(db, case_id)
    # Serialize docs to dict for medication processor
    doc_dicts = [
        {"id": d.documentId, "createdAt": d.createdAt.isoformat(), "medicalEntities": d.medicalEntities}
        for d in docs if d.medicalEntities
    ]

    from app.services.clinical_intelligence import ClinicalRuleEngine, process_medication_intelligence
    
    # Simple dict form for rule engine
    case_dict = {"intakeAnswers": case.intakeAnswers or {}}
    
    flags = ClinicalRuleEngine.evaluate_case(case_dict)
    medications = process_medication_intelligence(case_dict, doc_dicts)

    return {
        "redFlags": flags,
        "medicationIntelligence": medications
    }

@router.get("/{case_id}/fhir")
def export_fhir_prototype(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from app.services.fhir_mapper import generate_fhir_bundle
    bundle = generate_fhir_bundle(case)

    # Record audit event for FHIR export
    log_clinical_event(db, case_id, "fhir_exported", {"role": current_user.get("role"), "actor": current_user.get("username", current_user.get("role", "unknown"))})

    return bundle

@router.get("/{case_id}/unified")
def get_unified_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    from app.services.longitudinal_service import generate_unified_case
    unified = generate_unified_case(db, case_id)
    
    if not unified:
        raise HTTPException(status_code=404, detail="Case not found")
        
    return unified

class ItemReviewRequest(BaseModel):
    itemType: str  # "medications", "allergies", "diagnoses", "investigations", "procedures", "intake"
    itemId: str    # item index or key
    action: str    # "accepted", "edited", "rejected"
    reviewedValue: Optional[Any] = None
    originalValue: Optional[Any] = None
    sourceType: Optional[str] = "document"
    sourceDocumentId: Optional[str] = None
    snippet: Optional[str] = None
    pageLocation: Optional[str] = None

@router.post("/{case_id}/review-item")
def review_clinical_item(
    case_id: str,
    review_in: ItemReviewRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_doctor),
):
    from app.models.case import ClinicalCase
    from sqlalchemy.orm.attributes import flag_modified

    case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    field_path = f"{review_in.itemType}.{review_in.itemId}"

    # Record evidence decision and audit trail entry
    record_evidence_decision(
        db=db,
        case_id=case_id,
        field_path=field_path,
        action=review_in.action,
        source_type=review_in.sourceType or "document",
        source_document_id=review_in.sourceDocumentId,
        snippet=review_in.snippet,
        page_location=review_in.pageLocation,
        actor=current_user.get("username", "doctor"),
    )

    # Persist review in case.derivedClinicalData["doctorReviews"]
    from datetime import datetime, timezone
    derived = dict(case.derivedClinicalData or {})
    doctor_reviews = dict(derived.get("doctorReviews") or {})
    doctor_reviews[field_path] = {
        "itemType": review_in.itemType,
        "itemId": review_in.itemId,
        "action": review_in.action,
        "originalValue": review_in.originalValue,
        "reviewedValue": review_in.reviewedValue,
        "sourceDocumentId": review_in.sourceDocumentId,
        "snippet": review_in.snippet,
        "pageLocation": review_in.pageLocation,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "doctor": current_user.get("username", "doctor"),
    }
    derived["doctorReviews"] = doctor_reviews
    case.derivedClinicalData = derived
    flag_modified(case, "derivedClinicalData")
    db.commit()
    db.refresh(case)

    return {
        "success": True,
        "fieldPath": field_path,
        "review": doctor_reviews[field_path],
        "doctorReviews": doctor_reviews,
    }

@router.get("/{case_id}/audit")
def get_case_audit_log(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_doctor_or_admin),
):
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    events = get_case_audit_trail(db, case_id)
    return [
        {
            "eventId": e.eventId,
            "caseId": e.caseId,
            "eventType": e.eventType,
            "eventDate": e.eventDate.isoformat() if e.eventDate else None,
            "details": e.details,
            "status": e.status,
        }
        for e in events
    ]
