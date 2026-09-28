import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse
from app.models.case import ClinicalCase
from typing import Any, Dict, Optional, List

def create_case(db: Session, data: CaseCreate) -> CaseResponse:
    case_id = f"case-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    
    db_case = ClinicalCase(
        caseId=case_id,
        patientId=data.patientId,
        createdAt=now,
        updatedAt=now,
        language=data.language,
        consentGranted=data.consentGranted,
        status="intake"
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    return CaseResponse(
        caseId=db_case.caseId,
        patientId=db_case.patientId,
        createdAt=db_case.createdAt,
        updatedAt=db_case.updatedAt,
        language=db_case.language,
        consentGranted=db_case.consentGranted,
        status=db_case.status,
        intakeAnswers=db_case.intakeAnswers,
        derivedClinicalData=db_case.derivedClinicalData,
        clinicalAssessment=db_case.clinicalAssessment,
        reviewerId=db_case.reviewerId
    )

def get_case(db: Session, case_id: str) -> Optional[CaseResponse]:
    db_case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not db_case:
        return None
        
    return CaseResponse(
        caseId=db_case.caseId,
        patientId=db_case.patientId,
        createdAt=db_case.createdAt,
        updatedAt=db_case.updatedAt,
        language=db_case.language,
        consentGranted=db_case.consentGranted,
        status=db_case.status,
        intakeAnswers=db_case.intakeAnswers,
        derivedClinicalData=db_case.derivedClinicalData,
        clinicalAssessment=db_case.clinicalAssessment,
        reviewerId=db_case.reviewerId
    )

def update_case(db: Session, case_id: str, data: CaseUpdate) -> Optional[CaseResponse]:
    db_case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not db_case:
        return None
        
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = update_data["status"].value
    
    for key, value in update_data.items():
        setattr(db_case, key, value)
        
    db_case.updatedAt = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(db_case)
    
    return CaseResponse(
        caseId=db_case.caseId,
        patientId=db_case.patientId,
        createdAt=db_case.createdAt,
        updatedAt=db_case.updatedAt,
        language=db_case.language,
        consentGranted=db_case.consentGranted,
        status=db_case.status,
        intakeAnswers=db_case.intakeAnswers,
        derivedClinicalData=db_case.derivedClinicalData,
        clinicalAssessment=db_case.clinicalAssessment,
        reviewerId=db_case.reviewerId
    )

def update_derived_clinical_data(
    db: Session,
    case_id: str,
    data: Optional[Dict[str, Any]],
) -> Optional[CaseResponse]:
    db_case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not db_case:
        return None

    db_case.derivedClinicalData = data
    db_case.updatedAt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_case)

    return CaseResponse(
        caseId=db_case.caseId,
        patientId=db_case.patientId,
        createdAt=db_case.createdAt,
        updatedAt=db_case.updatedAt,
        language=db_case.language,
        consentGranted=db_case.consentGranted,
        status=db_case.status,
        intakeAnswers=db_case.intakeAnswers,
        derivedClinicalData=db_case.derivedClinicalData,
        clinicalAssessment=db_case.clinicalAssessment,
        reviewerId=db_case.reviewerId
    )

def get_cases(db: Session, status: Optional[str] = None) -> List[CaseResponse]:
    query = db.query(ClinicalCase)
    if status:
        query = query.filter(ClinicalCase.status == status)
    
    db_cases = query.order_by(ClinicalCase.createdAt.desc()).all()
    
    return [
        CaseResponse(
            caseId=c.caseId,
            patientId=c.patientId,
            createdAt=c.createdAt,
            updatedAt=c.updatedAt,
            language=c.language,
            consentGranted=c.consentGranted,
            status=c.status,
            intakeAnswers=c.intakeAnswers,
            derivedClinicalData=c.derivedClinicalData,
            clinicalAssessment=c.clinicalAssessment,
            reviewerId=c.reviewerId
        ) for c in db_cases
    ]
