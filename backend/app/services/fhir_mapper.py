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
        
    # 4. Conditions & Medications & Observations (from medical entities if available, filtered/adjusted by doctor review)
    if case.derivedClinicalData and "medicalEntities" in case.derivedClinicalData:
        doctor_reviews = {}
        if isinstance(case.derivedClinicalData, dict):
            doctor_reviews = case.derivedClinicalData.get("doctorReviews") or {}

        diagnoses = case.derivedClinicalData["medicalEntities"].get("diagnoses", [])
        for i, dx in enumerate(diagnoses):
            # Check if doctor rejected or edited this diagnosis
            review = doctor_reviews.get(f"diagnoses.{i}") or doctor_reviews.get(f"diagnoses:{i}")
            if review and review.get("action") == "rejected":
                continue
            dx_text = review.get("reviewedValue") if (review and review.get("action") == "edited" and review.get("reviewedValue")) else str(dx)

            cond = {
                "fullUrl": f"urn:uuid:cond-{case.caseId}-dx{i}",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"cond-{case.caseId}-dx{i}",
                    "clinicalStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                    },
                    "code": {
                        "text": str(dx_text)
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    }
                }
            }
            entries.append(cond)
            
        medications = case.derivedClinicalData["medicalEntities"].get("medications", [])
        for i, med in enumerate(medications):
            # Check if doctor rejected or edited this medication
            review = doctor_reviews.get(f"medications.{i}") or doctor_reviews.get(f"medications:{i}")
            if review and review.get("action") == "rejected":
                continue
            eff_med = review.get("reviewedValue") if (review and review.get("action") == "edited" and review.get("reviewedValue")) else med

            med_name = eff_med.get("name", "Unknown Medication") if isinstance(eff_med, dict) else getattr(eff_med, "name", "Unknown Medication")
            dosage_text = (
                f"{eff_med.get('dose', '')} {eff_med.get('frequency', '')} {eff_med.get('route', '')}".strip()
                if isinstance(eff_med, dict)
                else f"{getattr(eff_med, 'dose', '') or ''} {getattr(eff_med, 'frequency', '') or ''} {getattr(eff_med, 'route', '') or ''}".strip()
            )

            med_req = {
                "fullUrl": f"urn:uuid:med-{case.caseId}-{i}",
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": f"med-{case.caseId}-{i}",
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {
                        "text": med_name
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "dosageInstruction": [{
                        "text": dosage_text
                    }]
                }
            }
            entries.append(med_req)

        # 5. Observations (from investigations - lab name, value, unit, date if available; no invented values)
        investigations = case.derivedClinicalData["medicalEntities"].get("investigations", [])
        dates = case.derivedClinicalData["medicalEntities"].get("clinicallyRelevantDates", [])
        default_date = dates[0] if dates else None

        for i, inv in enumerate(investigations):
            review = doctor_reviews.get(f"investigations.{i}") or doctor_reviews.get(f"investigations:{i}")
            if review and review.get("action") == "rejected":
                continue
            eff_inv = review.get("reviewedValue") if (review and review.get("action") == "edited" and review.get("reviewedValue")) else inv

            if isinstance(eff_inv, str):
                test_name = eff_inv.strip()
                val_str = ""
                unit_str = ""
                ref_range = None
                abnormal = None
            elif hasattr(eff_inv, "testName"):
                test_name = getattr(eff_inv, "testName", "Investigation")
                val_str = str(getattr(eff_inv, "value", "") or "").strip()
                unit_str = getattr(eff_inv, "unit", "") or ""
                ref_range = getattr(eff_inv, "referenceRange", None)
                abnormal = getattr(eff_inv, "abnormalFlag", None)
            elif isinstance(eff_inv, dict):
                test_name = eff_inv.get("testName") or eff_inv.get("name") or "Investigation"
                val_str = str(eff_inv.get("value") or "").strip()
                unit_str = eff_inv.get("unit") or ""
                ref_range = eff_inv.get("referenceRange")
                abnormal = eff_inv.get("abnormalFlag")
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
