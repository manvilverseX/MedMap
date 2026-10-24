from typing import Dict, Any, List
from datetime import datetime, timezone

def validate_fhir_bundle(bundle: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates a FHIR R4 Bundle structurally:
    - Verifies resourceType is 'Bundle'
    - Verifies each entry has fullUrl and resource with resourceType and id
    - Verifies all internal references resolve within the bundle
    """
    errors: List[str] = []
    if not isinstance(bundle, dict):
        return {"valid": False, "errors": ["Bundle must be a JSON object"]}
    
    if bundle.get("resourceType") != "Bundle":
        errors.append(f"Expected resourceType 'Bundle', got '{bundle.get('resourceType')}'")
    
    entries = bundle.get("entry", [])
    declared_urls = set()
    declared_ids = set()

    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"Entry {idx} is not an object")
            continue
        full_url = entry.get("fullUrl")
        if full_url:
            declared_urls.add(full_url)
        resource = entry.get("resource")
        if not isinstance(resource, dict):
            errors.append(f"Entry {idx} missing valid resource")
            continue
        res_type = resource.get("resourceType")
        res_id = resource.get("id")
        if not res_type or not res_id:
            errors.append(f"Entry {idx} resource missing resourceType or id")
        else:
            declared_ids.add(f"{res_type}/{res_id}")
            declared_urls.add(f"urn:uuid:{res_id}")

    # Check internal references
    for idx, entry in enumerate(entries):
        resource = entry.get("resource", {})
        res_type = resource.get("resourceType", "Unknown")

        # Check common reference fields
        refs_to_check = []
        if "subject" in resource and isinstance(resource["subject"], dict):
            refs_to_check.append(("subject", resource["subject"].get("reference")))
        if "patient" in resource and isinstance(resource["patient"], dict):
            refs_to_check.append(("patient", resource["patient"].get("reference")))
        if "encounter" in resource and isinstance(resource["encounter"], dict):
            refs_to_check.append(("encounter", resource["encounter"].get("reference")))

        for field_name, ref in refs_to_check:
            if ref and ref not in declared_urls and ref not in declared_ids:
                errors.append(f"{res_type} entry {idx} references unresolved '{ref}' in {field_name}")

    return {"valid": len(errors) == 0, "errors": errors}


def generate_fhir_bundle(case: Any) -> Dict[str, Any]:
    """
    Generates a FHIR R4 Bundle containing Patient, Encounter, Condition, MedicationRequest,
    ServiceRequest, CarePlan, AllergyIntolerance, and Observation resources based on the
    ClinicalCase data and doctor's finalized clinicalAssessment.
    """
    entries = []
    doctor_reviews = {}
    if case.derivedClinicalData and isinstance(case.derivedClinicalData, dict):
        doctor_reviews = case.derivedClinicalData.get("doctorReviews") or {}

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
                    "verificationStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "provisional"}]
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

    # 4. Doctor's Finalized Record (case.clinicalAssessment)
    if getattr(case, "clinicalAssessment", None) and isinstance(case.clinicalAssessment, dict):
        doc_dx = case.clinicalAssessment.get("diagnosis")
        if doc_dx:
            dx_items = doc_dx if isinstance(doc_dx, list) else [l.strip() for l in str(doc_dx).split("\n") if l.strip()]
            for idx, dx_str in enumerate(dx_items):
                if not dx_str:
                    continue
                cond_doc = {
                    "fullUrl": f"urn:uuid:cond-{case.caseId}-doc-dx-{idx}",
                    "resource": {
                        "resourceType": "Condition",
                        "id": f"cond-{case.caseId}-doc-dx-{idx}",
                        "clinicalStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                        },
                        "verificationStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]
                        },
                        "category": [{
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "encounter-diagnosis", "display": "Encounter Diagnosis"}]
                        }],
                        "code": {
                            "text": dx_str
                        },
                        "subject": {
                            "reference": f"urn:uuid:{case.patientId}"
                        },
                        "encounter": {
                            "reference": f"urn:uuid:{case.caseId}"
                        },
                        "note": [{"text": "recorded by doctor"}]
                    }
                }
                entries.append(cond_doc)

        doc_rx = case.clinicalAssessment.get("prescription")
        if doc_rx:
            if isinstance(doc_rx, list):
                rx_list = doc_rx
            elif isinstance(doc_rx, dict):
                rx_list = [doc_rx]
            else:
                lines = [l.strip() for l in str(doc_rx).split("\n") if l.strip()]
                rx_list = lines if lines else [str(doc_rx).strip()]

            for idx, med_item in enumerate(rx_list):
                if isinstance(med_item, dict):
                    med_name = med_item.get("name") or med_item.get("medication") or str(med_item)
                    dosage = med_item.get("dosage") or med_item.get("dose") or med_name
                else:
                    med_name = str(med_item).strip()
                    dosage = med_name
                if not med_name:
                    continue
                med_req = {
                    "fullUrl": f"urn:uuid:med-{case.caseId}-doc-rx-{idx}",
                    "resource": {
                        "resourceType": "MedicationRequest",
                        "id": f"med-{case.caseId}-doc-rx-{idx}",
                        "status": "active",
                        "intent": "order",
                        "medicationCodeableConcept": {
                            "text": med_name
                        },
                        "dosageInstruction": [{
                            "text": dosage
                        }],
                        "subject": {
                            "reference": f"urn:uuid:{case.patientId}"
                        },
                        "encounter": {
                            "reference": f"urn:uuid:{case.caseId}"
                        },
                        "note": [{"text": "recorded by doctor"}]
                    }
                }
                entries.append(med_req)

        doc_inv = case.clinicalAssessment.get("investigations")
        if doc_inv:
            inv_list = doc_inv if isinstance(doc_inv, list) else [l.strip() for l in str(doc_inv).split("\n") if l.strip()]
            for idx, inv_item in enumerate(inv_list):
                inv_text = str(inv_item).strip()
                if not inv_text:
                    continue
                srv_req = {
                    "fullUrl": f"urn:uuid:req-{case.caseId}-doc-inv-{idx}",
                    "resource": {
                        "resourceType": "ServiceRequest",
                        "id": f"req-{case.caseId}-doc-inv-{idx}",
                        "status": "active",
                        "intent": "order",
                        "code": {
                            "text": inv_text
                        },
                        "subject": {
                            "reference": f"urn:uuid:{case.patientId}"
                        },
                        "encounter": {
                            "reference": f"urn:uuid:{case.caseId}"
                        },
                        "note": [{"text": "recorded by doctor"}]
                    }
                }
                entries.append(srv_req)

        doc_advice = case.clinicalAssessment.get("advice")
        doc_follow_up = case.clinicalAssessment.get("followUp")
        if doc_advice or doc_follow_up:
            notes = []
            desc_parts = []
            if doc_advice:
                adv_str = str(doc_advice).strip()
                notes.append({"text": f"Advice: {adv_str}"})
                desc_parts.append(adv_str)
            if doc_follow_up:
                fu_str = str(doc_follow_up).strip()
                notes.append({"text": f"Follow-up: {fu_str}"})
                desc_parts.append(f"Follow-up: {fu_str}")

            care_plan = {
                "fullUrl": f"urn:uuid:cp-{case.caseId}-doc-plan",
                "resource": {
                    "resourceType": "CarePlan",
                    "id": f"cp-{case.caseId}-doc-plan",
                    "status": "active",
                    "intent": "plan",
                    "description": "; ".join(desc_parts) if desc_parts else "Doctor clinical care plan",
                    "note": notes,
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "encounter": {
                        "reference": f"urn:uuid:{case.caseId}"
                    }
                }
            }
            entries.append(care_plan)

    # 5. AllergyIntolerance from intake allergies (patient-reported)
    if getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        allergy_raw = case.intakeAnswers.get("allergies")
        if allergy_raw:
            orig_text = None
            if isinstance(allergy_raw, dict):
                allergy_text = allergy_raw.get("value") or allergy_raw.get("original") or ""
                orig_text = allergy_raw.get("original")
            else:
                allergy_text = str(allergy_raw).strip()

            allergy_clean = allergy_text.strip().lower()
            is_negated = any(p in allergy_clean for p in ["no known", "no allergies", "no drug allerg", "nkda", "nka"]) or allergy_clean in ["none", "nil", "not sure"]

            allergy_review = doctor_reviews.get("allergies") or doctor_reviews.get("allergies.0") or doctor_reviews.get("intake.allergies")

            if allergy_review and allergy_review.get("action") == "rejected":
                # Exclude rejected allergy
                pass
            elif is_negated:
                allergy_res = {
                    "fullUrl": f"urn:uuid:allergy-{case.caseId}",
                    "resource": {
                        "resourceType": "AllergyIntolerance",
                        "id": f"allergy-{case.caseId}",
                        "clinicalStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]
                        },
                        "verificationStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "confirmed"}]
                        },
                        "code": {
                            "coding": [{
                                "system": "http://snomed.info/sct",
                                "code": "716186003",
                                "display": "No known allergy"
                            }],
                            "text": "No known allergies"
                        },
                        "patient": {
                            "reference": f"urn:uuid:{case.patientId}"
                        },
                        "encounter": {
                            "reference": f"urn:uuid:{case.caseId}"
                        }
                    }
                }
                if orig_text and orig_text.lower() != "no known allergies":
                    allergy_res["resource"]["note"] = [{"text": f"Patient original: {orig_text}"}]
                entries.append(allergy_res)
            elif allergy_text:
                if allergy_review and allergy_review.get("action") == "edited" and allergy_review.get("reviewedValue"):
                    eff_allergy = str(allergy_review.get("reviewedValue"))
                    is_confirmed = True
                elif allergy_review and allergy_review.get("action") == "accepted":
                    eff_allergy = allergy_text
                    is_confirmed = True
                else:
                    eff_allergy = allergy_text
                    is_confirmed = False

                allergy_res = {
                    "fullUrl": f"urn:uuid:allergy-{case.caseId}",
                    "resource": {
                        "resourceType": "AllergyIntolerance",
                        "id": f"allergy-{case.caseId}",
                        "clinicalStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]
                        },
                        "verificationStatus": {
                            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "confirmed" if is_confirmed else "unconfirmed"}]
                        },
                        "category": ["medication"],
                        "code": {
                            "text": eff_allergy
                        },
                        "patient": {
                            "reference": f"urn:uuid:{case.patientId}"
                        },
                        "encounter": {
                            "reference": f"urn:uuid:{case.caseId}"
                        }
                    }
                }
                if orig_text:
                    allergy_res["resource"]["note"] = [{"text": f"Patient original: {orig_text}"}]
                entries.append(allergy_res)

    # 6. Conditions & Medications & Observations from extracted medical entities
    if case.derivedClinicalData and "medicalEntities" in case.derivedClinicalData:
        diagnoses = case.derivedClinicalData["medicalEntities"].get("diagnoses", [])
        for i, dx in enumerate(diagnoses):
            review = doctor_reviews.get(f"diagnoses.{i}") or doctor_reviews.get(f"diagnoses:{i}")
            if review and review.get("action") == "rejected":
                continue
            is_confirmed = bool(review and review.get("action") in ("accepted", "edited"))
            dx_text = review.get("reviewedValue") if (review and review.get("action") == "edited" and review.get("reviewedValue")) else str(dx)

            cond = {
                "fullUrl": f"urn:uuid:cond-{case.caseId}-dx{i}",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"cond-{case.caseId}-dx{i}",
                    "clinicalStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
                    },
                    "verificationStatus": {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed" if is_confirmed else "provisional"}]
                    },
                    "code": {
                        "text": str(dx_text)
                    },
                    "subject": {
                        "reference": f"urn:uuid:{case.patientId}"
                    },
                    "encounter": {
                        "reference": f"urn:uuid:{case.caseId}"
                    }
                }
            }
            entries.append(cond)

        medications = case.derivedClinicalData["medicalEntities"].get("medications", [])
        for i, med in enumerate(medications):
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
                    "encounter": {
                        "reference": f"urn:uuid:{case.caseId}"
                    },
                    "dosageInstruction": [{
                        "text": dosage_text
                    }]
                }
            }
            entries.append(med_req)

        # Observations (from investigations - lab name, value, unit, date if available; no invented values)
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
