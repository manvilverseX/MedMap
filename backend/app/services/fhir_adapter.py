import uuid
from datetime import datetime

def map_case_to_fhir_patient(case_data: dict) -> dict:
    return {
        "resourceType": "Patient",
        "id": case_data.get("patientId", str(uuid.uuid4())),
        "active": True,
        "communication": [{
            "language": {
                "text": case_data.get("language", "English")
            }
        }]
    }

def map_case_to_fhir_encounter(case_data: dict) -> dict:
    return {
        "resourceType": "Encounter",
        "id": case_data.get("caseId", str(uuid.uuid4())),
        "status": "finished" if case_data.get("status") == "completed" else "in-progress",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "AMB",
            "display": "ambulatory"
        },
        "subject": {
            "reference": f"Patient/{case_data.get('patientId')}"
        },
        "period": {
            "start": case_data.get("createdAt"),
            "end": case_data.get("updatedAt")
        }
    }
