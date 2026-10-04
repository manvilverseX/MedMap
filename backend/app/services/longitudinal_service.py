from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.case import ClinicalCase
from app.schemas.case import CaseResponse

def get_patient_history(db: Session, patient_id: str) -> List[ClinicalCase]:
    """Retrieves all cases for a patient ordered by creation date."""
    return db.query(ClinicalCase).filter(
        ClinicalCase.patientId == patient_id,
        ClinicalCase.status == "completed"
    ).order_by(ClinicalCase.createdAt.asc()).all()

def compare_cases(previous_case: ClinicalCase, current_case: ClinicalCase) -> Dict[str, Any]:
    """
    Deterministically compares two clinical cases and returns structured differences.
    """
    changes = {
        "symptoms": {"new": [], "resolved": [], "unchanged": []},
        "medications": {"started": [], "stopped": [], "unchanged": []},
        "investigations": {"new": [], "unchanged": []}
    }

    # Compare Symptoms (from chiefComplaint / HPI in AI Summary)
    prev_symptoms = set()
    curr_symptoms = set()
    
    if previous_case.aiSummary and isinstance(previous_case.aiSummary, dict):
        if previous_case.aiSummary.get("chiefComplaint"):
            prev_symptoms.add(previous_case.aiSummary.get("chiefComplaint").lower())
    
    if current_case.aiSummary and isinstance(current_case.aiSummary, dict):
        if current_case.aiSummary.get("chiefComplaint"):
            curr_symptoms.add(current_case.aiSummary.get("chiefComplaint").lower())
            
    for sym in curr_symptoms:
        if sym in prev_symptoms:
            changes["symptoms"]["unchanged"].append(sym)
        else:
            changes["symptoms"]["new"].append(sym)
            
    for sym in prev_symptoms:
        if sym not in curr_symptoms:
            changes["symptoms"]["resolved"].append(sym)

    # Compare Medications (from derivedClinicalData.medicalEntities)
    def extract_meds(case_obj: ClinicalCase) -> set:
        meds = set()
        if case_obj.derivedClinicalData and "medicalEntities" in case_obj.derivedClinicalData:
            entities = case_obj.derivedClinicalData["medicalEntities"]
            if "medications" in entities:
                for med in entities["medications"]:
                    if isinstance(med, dict) and "name" in med:
                        meds.add(med["name"].lower())
        return meds

    prev_meds = extract_meds(previous_case)
    curr_meds = extract_meds(current_case)

    for med in curr_meds:
        if med in prev_meds:
            changes["medications"]["unchanged"].append(med)
        else:
            changes["medications"]["started"].append(med)
            
    for med in prev_meds:
        if med not in curr_meds:
            changes["medications"]["stopped"].append(med)

    return changes

def generate_unified_case(db: Session, current_case_id: str) -> Dict[str, Any]:
    """
    Generates a unified doctor-facing view incorporating longitudinal history.
    """
    current_case = db.query(ClinicalCase).filter(ClinicalCase.caseId == current_case_id).first()
    if not current_case:
        return None
        
    history = get_patient_history(db, current_case.patientId)
    previous_cases = [c for c in history if c.caseId != current_case_id and c.createdAt < current_case.createdAt]
    
    previous_verified_case = previous_cases[-1] if previous_cases else None
    
    longitudinal_changes = {}
    if previous_verified_case:
        longitudinal_changes = compare_cases(previous_verified_case, current_case)
        
    timeline = []
    for c in history:
        timeline.append({
            "type": "encounter",
            "date": c.createdAt.isoformat() if hasattr(c.createdAt, "isoformat") else str(c.createdAt),
            "status": c.status,
            "caseId": c.caseId
        })
        
    return {
        "patient": {
            "patientId": current_case.patientId,
            "language": current_case.language
        },
        "currentEncounter": current_case,
        "previousVerified": previous_verified_case,
        "longitudinalChanges": longitudinal_changes,
        "timeline": timeline,
        "missingInformation": []
    }
