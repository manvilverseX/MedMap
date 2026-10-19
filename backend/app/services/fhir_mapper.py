from typing import Dict, Any, List
from datetime import datetime, timezone

def generate_fhir_bundle(case: Any) -> Dict[str, Any]:
    """
    Generates a FHIR R4 Bundle containing Patient, Encounter, Condition, MedicationRequest,
    and Observation resources based on the ClinicalCase data.
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
        
    # 4. Conditions & Medications & Observations (from medical entities if available)
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
                        "text": med.get("name", "Unknown Medication") if isinstance(med, dict) else getattr(med, "name", "Unknown Medication")
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "dosageInstruction": [{
                        "text": (
                            f"{med.get('dose', '')} {med.get('frequency', '')} {med.get('route', '')}".strip()
                            if isinstance(med, dict)
                            else f"{getattr(med, 'dose', '') or ''} {getattr(med, 'frequency', '') or ''} {getattr(med, 'route', '') or ''}".strip()
                        )
                    }]
                }
            }
            entries.append(med_req)

        # 5. Observations (from investigations - lab name, value, unit, date if available; no invented values)
        investigations = case.derivedClinicalData["medicalEntities"].get("investigations", [])
        dates = case.derivedClinicalData["medicalEntities"].get("clinicallyRelevantDates", [])
        default_date = dates[0] if dates else None

        for i, inv in enumerate(investigations):
            if isinstance(inv, str):
                test_name = inv.strip()
                val_str = ""
                unit_str = ""
                ref_range = None
                abnormal = None
            elif hasattr(inv, "testName"):
                test_name = getattr(inv, "testName", "Investigation")
                val_str = str(getattr(inv, "value", "") or "").strip()
                unit_str = getattr(inv, "unit", "") or ""
                ref_range = getattr(inv, "referenceRange", None)
                abnormal = getattr(inv, "abnormalFlag", None)
            elif isinstance(inv, dict):
                test_name = inv.get("testName") or inv.get("name") or "Investigation"
                val_str = str(inv.get("value") or "").strip()
                unit_str = inv.get("unit") or ""
                ref_range = inv.get("referenceRange")
                abnormal = inv.get("abnormalFlag")
            else:
                continue

            if not test_name:
                continue

            obs_resource = {
                "fullUrl": f"urn:uuid:obs-{case.caseId}-{i}",
                "resource": {
                    "resourceType": "Observation",
                    "id": f"obs-{case.caseId}-{i}",
                    "status": "final",
                    "category": [{
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "laboratory",
                            "display": "Laboratory"
                        }]
                    }],
                    "code": {
                        "text": test_name
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "encounter": {
                        "reference": f"urn:uuid:{case.caseId}"
                    }
                }
            }

            # Map value without guessing / inventing
            if val_str:
                try:
                    num_val = float(val_str)
                    obs_resource["resource"]["valueQuantity"] = {
                        "value": num_val,
                        "unit": unit_str
                    }
                except ValueError:
                    full_val = f"{val_str} {unit_str}".strip() if unit_str else val_str
                    obs_resource["resource"]["valueString"] = full_val
            elif unit_str:
                obs_resource["resource"]["valueString"] = unit_str

            if default_date:
                obs_resource["resource"]["effectiveDateTime"] = default_date

            if ref_range:
                obs_resource["resource"]["referenceRange"] = [{"text": str(ref_range)}]

            if abnormal is True:
                obs_resource["resource"]["interpretation"] = [{
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                        "code": "A",
                        "display": "Abnormal"
                    }]
                }]

            entries.append(obs_resource)

    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry": entries
    }
    
    return bundle
