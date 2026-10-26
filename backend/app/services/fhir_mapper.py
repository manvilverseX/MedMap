from typing import Dict, Any, List
from datetime import datetime, timezone
import html
from app.services.interview_engine.ayush_questions import is_ayush_consultation

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
        if res_type == "Composition":
            for a_idx, auth in enumerate(resource.get("author", [])):
                if isinstance(auth, dict) and auth.get("reference"):
                    refs_to_check.append((f"author[{a_idx}]", auth.get("reference")))
            for s_idx, sec in enumerate(resource.get("section", [])):
                for e_idx, ent in enumerate(sec.get("entry", [])):
                    if isinstance(ent, dict) and ent.get("reference"):
                        refs_to_check.append((f"section[{s_idx}].entry[{e_idx}]", ent.get("reference")))

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

    # Build Composition resource as the document header (FHIR R4 Document rule)
    is_completed = getattr(case, "status", None) == "completed"
    is_finalized = is_completed or bool(getattr(case, "clinicalAssessment", None))

    # Gather available resource URLs for section entries
    entry_urls = {e.get("fullUrl") for e in entries if isinstance(e, dict) and e.get("fullUrl")}

    sections = []

    # 1. Chief Complaint
    cc_text = ""
    if getattr(case, "aiSummary", None):
        cc_text = getattr(case.aiSummary, "chiefComplaint", None) or (
            case.aiSummary.get("chiefComplaint") if isinstance(case.aiSummary, dict) else ""
        )
    if not cc_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_cc = case.intakeAnswers.get("chief_complaint")
        if isinstance(raw_cc, dict):
            cc_text = raw_cc.get("value") or raw_cc.get("original") or ""
        elif raw_cc:
            cc_text = str(raw_cc)
    if not cc_text:
        cc_text = "Chief complaint not recorded."

    cc_entries = []
    cc_ref = f"urn:uuid:cond-{case.caseId}-cc"
    if cc_ref in entry_urls:
        cc_entries.append({"reference": cc_ref})

    sections.append({
        "title": "Chief Complaint",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "10154-3",
                "display": "Chief complaint Narrative - Reported"
            }],
            "text": "Chief Complaint"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(cc_text))}</p></div>"
        },
        "entry": cc_entries
    })

    # 2. History of Present Illness
    hpi_text = ""
    if getattr(case, "aiSummary", None):
        hpi_text = getattr(case.aiSummary, "historyOfPresentIllness", None) or (
            case.aiSummary.get("historyOfPresentIllness") if isinstance(case.aiSummary, dict) else ""
        )
    if not hpi_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_hpi = case.intakeAnswers.get("history_present_illness") or case.intakeAnswers.get("hpi")
        if isinstance(raw_hpi, dict):
            hpi_text = raw_hpi.get("value") or raw_hpi.get("original") or ""
        elif raw_hpi:
            hpi_text = str(raw_hpi)
    if not hpi_text:
        hpi_text = "History of present illness not recorded."

    sections.append({
        "title": "History of Present Illness",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "10164-2",
                "display": "History of Present illness Narrative"
            }],
            "text": "History of Present Illness"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(hpi_text))}</p></div>"
        },
        "entry": []
    })

    # 3. Past Medical History
    pmh_text = ""
    if getattr(case, "aiSummary", None):
        pmh_text = getattr(case.aiSummary, "pastMedicalHistory", None) or (
            case.aiSummary.get("pastMedicalHistory") if isinstance(case.aiSummary, dict) else ""
        )
    if not pmh_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_pmh = case.intakeAnswers.get("past_medical")
        if isinstance(raw_pmh, dict):
            pmh_text = raw_pmh.get("value") or raw_pmh.get("original") or ""
        elif raw_pmh:
            pmh_text = str(raw_pmh)
    if not pmh_text:
        pmh_text = "No past medical history recorded."

    pmh_entries = []
    if case.derivedClinicalData and isinstance(case.derivedClinicalData, dict) and "medicalEntities" in case.derivedClinicalData:
        diagnoses = case.derivedClinicalData["medicalEntities"].get("diagnoses", [])
        for i in range(len(diagnoses)):
            dx_ref = f"urn:uuid:cond-{case.caseId}-dx{i}"
            if dx_ref in entry_urls:
                pmh_entries.append({"reference": dx_ref})

    sections.append({
        "title": "Past Medical History",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "11348-0",
                "display": "History of Past illness Narrative"
            }],
            "text": "Past Medical History"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(pmh_text))}</p></div>"
        },
        "entry": pmh_entries
    })

    # 4. Medications
    med_text = ""
    if getattr(case, "aiSummary", None):
        med_text = getattr(case.aiSummary, "medications", None) or (
            case.aiSummary.get("medications") if isinstance(case.aiSummary, dict) else ""
        )
    if not med_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_med = case.intakeAnswers.get("medications") or case.intakeAnswers.get("current_medications")
        if isinstance(raw_med, dict):
            med_text = raw_med.get("value") or raw_med.get("original") or ""
        elif raw_med:
            med_text = str(raw_med)
    if not med_text:
        med_text = "No current medications reported."

    med_entries = []
    for e in entries:
        r = e.get("resource", {})
        if r.get("resourceType") == "MedicationRequest":
            full_u = e.get("fullUrl")
            if full_u:
                med_entries.append({"reference": full_u})

    sections.append({
        "title": "Medications",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "10160-0",
                "display": "History of Medication use Narrative"
            }],
            "text": "Medications"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(med_text))}</p></div>"
        },
        "entry": med_entries
    })

    # 5. Allergies
    allergy_text = ""
    if getattr(case, "aiSummary", None):
        allergy_text = getattr(case.aiSummary, "allergies", None) or (
            case.aiSummary.get("allergies") if isinstance(case.aiSummary, dict) else ""
        )
    if not allergy_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_al = case.intakeAnswers.get("allergies")
        if isinstance(raw_al, dict):
            allergy_text = raw_al.get("value") or raw_al.get("original") or ""
        elif raw_al:
            allergy_text = str(raw_al)
    if not allergy_text:
        allergy_text = "No known allergies reported."

    allergy_entries = []
    al_ref = f"urn:uuid:allergy-{case.caseId}"
    if al_ref in entry_urls:
        allergy_entries.append({"reference": al_ref})

    sections.append({
        "title": "Allergies and Adverse Reactions",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "48765-2",
                "display": "Allergies and adverse reactions Document"
            }],
            "text": "Allergies and Adverse Reactions"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(allergy_text))}</p></div>"
        },
        "entry": allergy_entries
    })

    # 6. Family History
    fh_text = ""
    if getattr(case, "aiSummary", None):
        fh_text = getattr(case.aiSummary, "familyHistory", None) or (
            case.aiSummary.get("familyHistory") if isinstance(case.aiSummary, dict) else ""
        )
    if not fh_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_fh = case.intakeAnswers.get("family_history")
        if isinstance(raw_fh, dict):
            fh_text = raw_fh.get("value") or raw_fh.get("original") or ""
        elif raw_fh:
            fh_text = str(raw_fh)
    if not fh_text:
        fh_text = "No significant family history reported."

    sections.append({
        "title": "Family History",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "10157-6",
                "display": "History of Family member diseases Narrative"
            }],
            "text": "Family History"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(fh_text))}</p></div>"
        },
        "entry": []
    })

    # 7. Review of Systems
    ros_text = ""
    if getattr(case, "aiSummary", None):
        ros_text = getattr(case.aiSummary, "reviewOfSystems", None) or (
            case.aiSummary.get("reviewOfSystems") if isinstance(case.aiSummary, dict) else ""
        )
    if not ros_text and getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        raw_ros = case.intakeAnswers.get("review_of_systems")
        if isinstance(raw_ros, dict):
            ros_text = raw_ros.get("value") or raw_ros.get("original") or ""
        elif raw_ros:
            ros_text = str(raw_ros)
    if not ros_text:
        ros_text = "Review of systems unrevealed."

    ros_entries = []
    for e in entries:
        r = e.get("resource", {})
        if r.get("resourceType") == "Observation":
            full_u = e.get("fullUrl")
            if full_u:
                ros_entries.append({"reference": full_u})

    sections.append({
        "title": "Review of Systems",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "10187-3",
                "display": "Review of systems Narrative - Reported"
            }],
            "text": "Review of Systems"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(str(ros_text))}</p></div>"
        },
        "entry": ros_entries
    })

    # 8. AYUSH Assessment (only if the case has one)
    has_ayush = False
    ayush_summary_items = []
    if getattr(case, "intakeAnswers", None) and isinstance(case.intakeAnswers, dict):
        has_ayush = (
            is_ayush_consultation(case.intakeAnswers)
            or any(k.startswith("ayush") for k in case.intakeAnswers.keys() if case.intakeAnswers[k])
            or bool(case.intakeAnswers.get("ayush"))
        )
        if has_ayush:
            for k, v in case.intakeAnswers.items():
                if k.startswith("ayush_") or k == "ayush":
                    val_str = v.get("value") or v.get("original") if isinstance(v, dict) else str(v)
                    clean_k = k.replace("ayush_", "").replace("_", " ").capitalize()
                    ayush_summary_items.append(f"{clean_k}: {val_str}")

    if has_ayush:
        ayush_div = "<p>" + "<br/>".join(
            html.escape(item) for item in (ayush_summary_items if ayush_summary_items else ["AYUSH consultation pathway designated."])
        ) + "</p>"
        sections.append({
            "title": "AYUSH / Ayurveda Assessment",
            "code": {
                "coding": [{
                    "system": "http://medmap.in/fhir/cs/ayush",
                    "code": "ayush-assessment",
                    "display": "AYUSH Assessment"
                }],
                "text": "AYUSH Assessment"
            },
            "text": {
                "status": "generated",
                "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">{ayush_div}</div>"
            },
            "entry": []
        })

    # 9. Documents Reviewed
    doc_entries = []
    for e in entries:
        r = e.get("resource", {})
        if r.get("resourceType") == "DocumentReference":
            full_u = e.get("fullUrl")
            if full_u:
                doc_entries.append({"reference": full_u})

    doc_summary_text = (
        f"{len(doc_entries)} clinical document(s) referenced in case record."
        if doc_entries
        else "Clinical records reviewed during pre-consultation intake."
    )
    sections.append({
        "title": "Documents Reviewed",
        "code": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "55107-7",
                "display": "Addendum Document"
            }],
            "text": "Documents Reviewed"
        },
        "text": {
            "status": "generated",
            "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>{html.escape(doc_summary_text)}</p></div>"
        },
        "entry": doc_entries
    })

    # 10. Doctor Assessment and Plan (only if finalized)
    if is_finalized:
        doc_entries = []
        for e in entries:
            r = e.get("resource", {})
            rid = str(r.get("id", ""))
            rtype = r.get("resourceType")
            notes = r.get("note", [])
            has_doctor_note = any("recorded by doctor" in str(n.get("text", "")) for n in notes if isinstance(n, dict))
            if (
                "-doc-" in rid
                or rtype == "CarePlan"
                or has_doctor_note
            ):
                full_u = e.get("fullUrl")
                if full_u and {"reference": full_u} not in doc_entries:
                    doc_entries.append({"reference": full_u})

        plan_parts = []
        if getattr(case, "clinicalAssessment", None) and isinstance(case.clinicalAssessment, dict):
            for k in ["diagnosis", "prescription", "investigations", "advice", "followUp"]:
                v = case.clinicalAssessment.get(k)
                if v:
                    plan_parts.append(f"{k.capitalize()}: {v}")
        plan_summary = (
            "\n".join(plan_parts)
            if plan_parts
            else "Doctor finalized clinical assessment and management plan."
        )

        sections.append({
            "title": "Doctor Assessment and Plan",
            "code": {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": "51847-2",
                    "display": "Evaluation+Plan note"
                }],
                "text": "Assessment and Plan"
            },
            "text": {
                "status": "generated",
                "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>" + "<br/>".join(html.escape(p) for p in plan_summary.split("\n")) + "</p></div>"
            },
            "entry": doc_entries
        })

    # Author: doctor if finalized; else "MedMap patient-reported intake"
    if is_finalized:
        doc_name = (
            (case.clinicalAssessment.get("doctor") if isinstance(getattr(case, "clinicalAssessment", None), dict) else None)
            or getattr(case, "reviewerId", None)
            or "Doctor"
        )
        doc_display = f"Dr. {doc_name}" if not str(doc_name).startswith("Dr.") else str(doc_name)
        author_list = [{"display": doc_display}]
    else:
        author_list = [{"display": "MedMap patient-reported intake"}]

    comp_date = (
        case.updatedAt.isoformat()
        if hasattr(getattr(case, "updatedAt", None), "isoformat")
        else (str(getattr(case, "updatedAt", "")) or datetime.now(timezone.utc).isoformat())
    )

    composition_resource = {
        "resourceType": "Composition",
        "id": f"comp-{case.caseId}",
        "status": "final" if is_completed else "preliminary",
        "type": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "34117-2",
                "display": "History and physical note"
            }],
            "text": "Clinical history note"
        },
        "subject": {
            "reference": f"urn:uuid:{case.patientId}",
            "display": f"Patient {case.patientId}"
        },
        "encounter": {
            "reference": f"urn:uuid:{case.caseId}"
        },
        "date": comp_date,
        "author": author_list,
        "title": f"Clinical Case Summary - {case.caseId}",
        "section": sections
    }

    composition_entry = {
        "fullUrl": f"urn:uuid:comp-{case.caseId}",
        "resource": composition_resource
    }
    entries.insert(0, composition_entry)

    bundle = {
        "resourceType": "Bundle",
        "type": "document",
        "timestamp": comp_date,
        "entry": entries
    }
    
    return bundle
