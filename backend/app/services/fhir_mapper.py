from typing import Dict, Any, List
from datetime import datetime

def generate_fhir_bundle(case: Any) -> Dict[str, Any]:
    """
    Generates a FHIR R4 Bundle containing Patient, Encounter, Condition, and MedicationRequest
    resources based on the ClinicalCase data.
    """
    
    entries = []
    
    # 1. Patient Resource
    patient_resource = {
        "fullUrl": f"urn:uuid:{case.patientId}",
        "resource": {
            "resourceType": "Patient",
            "id": case.patientId,
            "text": {
                "status": "generated",
                "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">Patient {case.patientId}</div>"
            },
        }
    }
    entries.append(patient_resource)
    
    # 2. Encounter Resource
    encounter_status = "finished" if case.status == "completed" else "in-progress"
    encounter_resource = {
        "fullUrl": f"urn:uuid:{case.caseId}",
        "resource": {
            "resourceType": "Encounter",
            "id": case.caseId,
            "status": encounter_status,
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "AMB",
                "display": "ambulatory"
            },
            "subject": {
                "reference": f"urn:uuid:{case.patientId}"
            },
            "period": {
                "start": case.createdAt.isoformat() if hasattr(case.createdAt, "isoformat") else str(case.createdAt),
                "end": case.updatedAt.isoformat() if hasattr(case.updatedAt, "isoformat") else str(case.updatedAt)
            }
        }
    }
    entries.append(encounter_resource)
    
    # 3. Condition (Chief Complaint)
    if case.aiSummary:
        cc = case.aiSummary.chiefComplaint if hasattr(case.aiSummary, "chiefComplaint") else case.aiSummary.get("chiefComplaint")
        if cc:
            condition_resource = {
                "fullUrl": f"urn:uuid:cond-{case.caseId}-cc",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"cond-{case.caseId}-cc",
                    "clinicalStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                    },
                    "category": [{
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "encounter-diagnosis", "display": "Encounter Diagnosis"}]
                    }],
                    "code": {
                        "text": cc
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "encounter": {
                        "reference": f"urn:uuid:{case.caseId}"
                    }
                }
            }
            entries.append(condition_resource)
        
    # 4. Conditions (from medical entities if available)
    if case.derivedClinicalData and "medicalEntities" in case.derivedClinicalData:
        diagnoses = case.derivedClinicalData["medicalEntities"].get("diagnoses", [])
        for i, dx in enumerate(diagnoses):
            cond = {
                "fullUrl": f"urn:uuid:cond-{case.caseId}-dx{i}",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"cond-{case.caseId}-dx{i}",
                    "clinicalStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                    },
                    "code": {
                        "text": str(dx)
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    }
                }
            }
            entries.append(cond)
            
        medications = case.derivedClinicalData["medicalEntities"].get("medications", [])
        for i, med in enumerate(medications):
            med_req = {
                "fullUrl": f"urn:uuid:med-{case.caseId}-{i}",
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": f"med-{case.caseId}-{i}",
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {
                        "text": med.get("name", "Unknown Medication")
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "dosageInstruction": [{
                        "text": f"{med.get('dose', '')} {med.get('frequency', '')} {med.get('route', '')}".strip()
                    }]
                }
            }
            entries.append(med_req)

    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "entry": entries
    }
    
    return bundle
