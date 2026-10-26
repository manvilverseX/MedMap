import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.case import ClinicalCase
import uuid
from datetime import datetime, timezone

from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_fhir.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    import os
    from passlib.context import CryptContext
    from app.models.user import User
    
    if os.path.exists("./test_fhir.db"):
        os.remove("./test_fhir.db")
        
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    doctor = User(id=str(uuid.uuid4()), username="testdoc", hashed_password=pwd_context.hash("pass123"), role="doctor")
    db.add(doctor)
    db.commit()
    db.close()
    
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_fhir.db"):
        try:
            os.remove("./test_fhir.db")
        except:
            pass

def test_fhir_export():
    db_session = TestingSessionLocal()
    # Setup test case
    case_id = str(uuid.uuid4())
    patient_id = "pat-fhir-1"
    
    db_case = ClinicalCase(
        caseId=case_id,
        patientId=patient_id,
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        aiSummary={
            "chiefComplaint": "Fever and chills", 
            "historyOfPresentIllness": "HPI", 
            "pastMedicalHistory": "PMH", 
            "medications": "Paracetamol"
        },
        derivedClinicalData={
            "medicalEntities": {
                "diagnoses": ["Dengue"],
                "medications": [{"name": "Paracetamol", "dose": "500mg"}]
            }
        }
    )
    db_session.add(db_case)
    db_session.commit()
    
    # Generate token for access
    res = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc", "password": "pass123"})
    token = res.json()["access_token"]
    
    # Hit FHIR endpoint
    res_fhir = client.get(f"/api/v1/cases/{case_id}/fhir", headers={"Authorization": f"Bearer {token}"})
    assert res_fhir.status_code == 200
    bundle = res_fhir.json()
    
    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "document"
    assert bundle["entry"][0]["resource"]["resourceType"] == "Composition"

    resources = [entry["resource"] for entry in bundle["entry"]]
    resource_types = [r["resourceType"] for r in resources]

    assert "Composition" in resource_types
    assert "Patient" in resource_types
    assert "Encounter" in resource_types
    assert "Condition" in resource_types
    assert "MedicationRequest" in resource_types
    
    # Verify specific fields
    patient = next(r for r in resources if r["resourceType"] == "Patient")
    assert patient["id"] == patient_id
    
    encounter = next(r for r in resources if r["resourceType"] == "Encounter")
    assert encounter["status"] == "finished"


def test_fhir_observation_mapping_from_investigations():
    """Verify Observation resources are correctly mapped from extracted investigations without inventing data."""
    db_session = TestingSessionLocal()
    case_id = str(uuid.uuid4())
    patient_id = "pat-fhir-obs"

    db_case = ClinicalCase(
        caseId=case_id,
        patientId=patient_id,
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        aiSummary={
            "chiefComplaint": "Routine diabetic checkup",
            "historyOfPresentIllness": "HPI details",
            "pastMedicalHistory": "PMH details",
        },
        derivedClinicalData={
            "medicalEntities": {
                "clinicallyRelevantDates": ["2026-03-15"],
                "investigations": [
                    {
                        "testName": "HbA1c",
                        "value": "7.4",
                        "unit": "%",
                        "referenceRange": "4.0 - 5.6",
                        "abnormalFlag": True,
                    },
                    {
                        "testName": "Fasting Blood Glucose",
                        "value": "138",
                        "unit": "mg/dL",
                        "referenceRange": "70 - 99",
                        "abnormalFlag": True,
                    },
                    {
                        "testName": "Urine Routine",
                        "value": "Nil albumin, no pus cells",
                        "unit": None,
                        "referenceRange": None,
                        "abnormalFlag": False,
                    },
                ],
            }
        },
    )
    db_session.add(db_case)
    db_session.commit()

    res = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc", "password": "pass123"})
    token = res.json()["access_token"]

    res_fhir = client.get(f"/api/v1/cases/{case_id}/fhir", headers={"Authorization": f"Bearer {token}"})
    assert res_fhir.status_code == 200
    bundle = res_fhir.json()

    observations = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Observation"]
    assert len(observations) == 3

    # Check numeric observation (HbA1c)
    hba1c_obs = next(o for o in observations if o["code"]["text"] == "HbA1c")
    assert hba1c_obs["valueQuantity"]["value"] == 7.4
    assert hba1c_obs["valueQuantity"]["unit"] == "%"
    assert hba1c_obs["referenceRange"][0]["text"] == "4.0 - 5.6"
    assert hba1c_obs["interpretation"][0]["coding"][0]["code"] == "A"
    assert hba1c_obs["effectiveDateTime"] == "2026-03-15"
    assert hba1c_obs["subject"]["reference"] == f"urn:uuid:{patient_id}"
    assert hba1c_obs["encounter"]["reference"] == f"urn:uuid:{case_id}"

    # Check textual observation (Urine Routine)
    urine_obs = next(o for o in observations if o["code"]["text"] == "Urine Routine")
    assert urine_obs["valueString"] == "Nil albumin, no pus cells"
    assert "referenceRange" not in urine_obs
    assert "interpretation" not in urine_obs


def test_fhir_doctor_finalized_record_and_allergies():
    """Verify that doctor's finalized record and allergies reach FHIR with proper negation, acceptance, and edits."""
    from app.services.fhir_mapper import generate_fhir_bundle, validate_fhir_bundle

    db_session = TestingSessionLocal()
    case_id = str(uuid.uuid4())
    patient_id = "pat-doc-final"

    db_case = ClinicalCase(
        caseId=case_id,
        patientId=patient_id,
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        intakeAnswers={
            "chief_complaint": "Severe chest pain",
            "allergies": "No known drug allergies",
        },
        clinicalAssessment={
            "diagnosis": "Acute Myocardial Infarction",
            "prescription": "Aspirin 325mg stat\nClopidogrel 300mg stat\nAtorvastatin 80mg OD",
            "investigations": "Urgent Coronary Angiography\n12-lead ECG serial",
            "advice": "Strict bed rest, low salt cardiac diet",
            "followUp": "Cardiology clinic in 3 days post-discharge",
        },
        derivedClinicalData={
            "medicalEntities": {
                "diagnoses": ["Unstable Angina", "Gastritis"],
                "medications": [{"name": "Amlodipine", "dose": "5mg"}],
                "investigations": [],
            },
            "doctorReviews": {
                "diagnoses.0": {"action": "accepted"},
                "diagnoses.1": {"action": "rejected"},
                "medications.0": {"action": "edited", "reviewedValue": {"name": "Amlodipine Besylate", "dose": "10mg", "frequency": "OD"}},
            },
        },
    )
    db_session.add(db_case)
    db_session.commit()

    bundle = generate_fhir_bundle(db_case)
    validation = validate_fhir_bundle(bundle)
    assert validation["valid"] is True, f"Validation errors: {validation['errors']}"

    resources = [entry["resource"] for entry in bundle["entry"]]
    by_type = {}
    for r in resources:
        by_type.setdefault(r["resourceType"], []).append(r)

    # 1. Doctor's diagnosis condition present with confirmed status and note
    doc_conditions = [c for c in by_type.get("Condition", []) if c["code"]["text"] == "Acute Myocardial Infarction"]
    assert len(doc_conditions) == 1
    assert doc_conditions[0]["verificationStatus"]["coding"][0]["code"] == "confirmed"
    assert doc_conditions[0]["note"][0]["text"] == "recorded by doctor"

    # 2. Doctor-accepted entity present with confirmed status
    accepted_conds = [c for c in by_type.get("Condition", []) if c["code"]["text"] == "Unstable Angina"]
    assert len(accepted_conds) == 1
    assert accepted_conds[0]["verificationStatus"]["coding"][0]["code"] == "confirmed"

    # 3. Doctor-rejected entity excluded
    rejected_conds = [c for c in by_type.get("Condition", []) if c["code"]["text"] == "Gastritis"]
    assert len(rejected_conds) == 0

    # 4. Doctor-edited medication uses edited value, original unedited absent
    med_requests = by_type.get("MedicationRequest", [])
    med_names = [m["medicationCodeableConcept"]["text"] for m in med_requests]
    assert "Amlodipine Besylate" in med_names
    assert "Amlodipine" not in med_names

    # 5. Doctor's prescription entries present as MedicationRequest
    assert any("Aspirin 325mg stat" in name for name in med_names)
    assert any("Clopidogrel 300mg stat" in name for name in med_names)

    # 6. Doctor's investigations present as ServiceRequest
    srv_requests = by_type.get("ServiceRequest", [])
    srv_codes = [s["code"]["text"] for s in srv_requests]
    assert any("Urgent Coronary Angiography" in c for c in srv_codes)

    # 7. Doctor's advice and follow-up present as CarePlan
    care_plans = by_type.get("CarePlan", [])
    assert len(care_plans) >= 1
    assert any("Strict bed rest" in cp.get("description", "") or any("Strict bed rest" in n.get("text", "") for n in cp.get("note", [])) for cp in care_plans)

    # 8. Negation form for "No known drug allergies" emitted as proper AllergyIntolerance negation
    allergies = by_type.get("AllergyIntolerance", [])
    assert len(allergies) == 1
    allergy = allergies[0]
    assert allergy["verificationStatus"]["coding"][0]["code"] == "confirmed"
    assert allergy["code"]["coding"][0]["code"] == "716186003"
    assert allergy["code"]["coding"][0]["display"] == "No known allergy"
    assert allergy["patient"]["reference"] == f"urn:uuid:{patient_id}"
    assert allergy["encounter"]["reference"] == f"urn:uuid:{case_id}"


def test_fhir_positive_allergy_with_doctor_review():
    """Verify positive allergy intolerance mapping and doctor review state."""
    from app.services.fhir_mapper import generate_fhir_bundle, validate_fhir_bundle

    case_id = str(uuid.uuid4())
    patient_id = "pat-allergy-pos"

    class CaseMock:
        pass

    case_obj = CaseMock()
    case_obj.caseId = case_id
    case_obj.patientId = patient_id
    case_obj.createdAt = datetime.now(timezone.utc)
    case_obj.updatedAt = datetime.now(timezone.utc)
    case_obj.status = "completed"
    case_obj.aiSummary = None
    case_obj.intakeAnswers = {"allergies": "Penicillin (causes facial hives)"}
    case_obj.clinicalAssessment = None
    case_obj.derivedClinicalData = {
        "doctorReviews": {
            "allergies": {"action": "accepted"}
        }
    }

    bundle = generate_fhir_bundle(case_obj)
    validation = validate_fhir_bundle(bundle)
    assert validation["valid"] is True

    allergies = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "AllergyIntolerance"]
    assert len(allergies) == 1
    assert allergies[0]["code"]["text"] == "Penicillin (causes facial hives)"
    assert allergies[0]["verificationStatus"]["coding"][0]["code"] == "confirmed"


def test_fhir_composition_requirements():
    """
    Tests that:
    1. First entry is Composition.
    2. Every reference resolves within the bundle.
    3. Every resource has resourceType and id.
    4. The bundle validates with validate_fhir_bundle.
    5. AYUSH section is only present when AYUSH answers exist.
    6. Doctor assessment & plan section is only present when finalized.
    """
    from app.services.fhir_mapper import generate_fhir_bundle, validate_fhir_bundle

    # Case A: Unfinalized without AYUSH
    case_a = ClinicalCase(
        caseId=str(uuid.uuid4()),
        patientId="pat-unfinalized",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="intake",
        consentGranted=True,
        intakeAnswers={"chief_complaint": "Persistent cough"},
        clinicalAssessment=None,
    )
    bundle_a = generate_fhir_bundle(case_a)
    val_a = validate_fhir_bundle(bundle_a)
    assert val_a["valid"] is True, f"Validation errors: {val_a['errors']}"
    assert bundle_a["type"] == "document"
    assert bundle_a["entry"][0]["resource"]["resourceType"] == "Composition"

    comp_a = bundle_a["entry"][0]["resource"]
    assert comp_a["status"] == "preliminary"
    assert comp_a["author"] == [{"display": "MedMap patient-reported intake"}]
    sec_titles_a = [s["title"] for s in comp_a["section"]]
    assert "Chief Complaint" in sec_titles_a
    assert "History of Present Illness" in sec_titles_a
    assert "Past Medical History" in sec_titles_a
    assert "Medications" in sec_titles_a
    assert "Allergies and Adverse Reactions" in sec_titles_a
    assert "Family History" in sec_titles_a
    assert "Review of Systems" in sec_titles_a
    assert "Documents Reviewed" in sec_titles_a
    assert "AYUSH / Ayurveda Assessment" not in sec_titles_a
    assert "Doctor Assessment and Plan" not in sec_titles_a

    # Every resource has resourceType and id
    for idx, entry in enumerate(bundle_a["entry"]):
        res = entry["resource"]
        assert res.get("resourceType"), f"Entry {idx} missing resourceType"
        assert res.get("id"), f"Entry {idx} missing id"

    # Case B: Finalized with AYUSH
    case_b = ClinicalCase(
        caseId=str(uuid.uuid4()),
        patientId="pat-ayush-final",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        intakeAnswers={
            "consultation_type": "ayush",
            "ayush_prakriti": "Vata-dominant",
            "ayush_vikriti": "Dryness and bloating",
            "allergies": "No known allergies"
        },
        clinicalAssessment={
            "diagnosis": "Vata Imbalance",
            "prescription": "Ashwagandha 500mg BD",
            "advice": "Warm diet",
            "doctor": "Dr. Sharma"
        },
        derivedClinicalData={
            "medicalEntities": {
                "diagnoses": ["Dyspepsia"],
                "medications": [],
                "investigations": []
            }
        }
    )
    bundle_b = generate_fhir_bundle(case_b)
    val_b = validate_fhir_bundle(bundle_b)
    assert val_b["valid"] is True, f"Validation errors: {val_b['errors']}"
    assert bundle_b["type"] == "document"
    assert bundle_b["entry"][0]["resource"]["resourceType"] == "Composition"

    comp_b = bundle_b["entry"][0]["resource"]
    assert comp_b["status"] == "final"
    assert comp_b["author"] == [{"display": "Dr. Sharma"}]
    sec_titles_b = [s["title"] for s in comp_b["section"]]
    assert "AYUSH / Ayurveda Assessment" in sec_titles_b
    assert "Doctor Assessment and Plan" in sec_titles_b

    # Check every reference in sections resolves
    declared_urls = {e["fullUrl"] for e in bundle_b["entry"]}
    for s in comp_b["section"]:
        for ent in s.get("entry", []):
            assert ent["reference"] in declared_urls


def test_simulated_his_handoff_outcomes():
    """
    Tests all 4 outcomes for POST /api/v1/cases/{case_id}/his-handoff:
    1. 200 - Successful simulated handoff for completed case with doctor auth.
    2. 409 - Conflict when case is not completed.
    3. 403 - Forbidden when caller is not a doctor (e.g. patient).
    4. 404 - Not found for unknown case.
    """
    from app.core.security import create_access_token

    db_session = TestingSessionLocal()
    completed_case_id = str(uuid.uuid4())
    in_progress_case_id = str(uuid.uuid4())

    case_completed = ClinicalCase(
        caseId=completed_case_id,
        patientId="pat-his-comp",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        aiSummary={
            "chiefComplaint": "Fever and sore throat",
            "historyOfPresentIllness": "Started 3 days ago",
            "pastMedicalHistory": "None"
        },
        clinicalAssessment={
            "diagnosis": "Viral pharyngitis",
            "prescription": "Paracetamol 500mg TDS",
            "advice": "Warm fluids and rest"
        }
    )

    case_in_progress = ClinicalCase(
        caseId=in_progress_case_id,
        patientId="pat-his-prog",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="intake",
        consentGranted=True,
        intakeAnswers={"chief_complaint": "Headache"}
    )

    db_session.add(case_completed)
    db_session.add(case_in_progress)
    db_session.commit()

    # Doctor auth token
    res_login = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc", "password": "pass123"})
    assert res_login.status_code == 200
    doc_token = res_login.json()["access_token"]
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    # Patient auth token
    pat_token = create_access_token({"sub": "pat-his-comp", "role": "patient", "case_id": completed_case_id})
    pat_headers = {"Authorization": f"Bearer {pat_token}"}

    # 1. Outcome 200: Doctor handoff on completed case
    res_200 = client.post(f"/api/v1/cases/{completed_case_id}/his-handoff", headers=doc_headers)
    assert res_200.status_code == 200
    receipt = res_200.json()
    assert receipt["status"] == "SIMULATED_ACCEPTED"
    assert receipt["simulation"] is True
    assert receipt["note"] == "Simulation: not connected to a real hospital information system"
    assert receipt["referenceId"].startswith("HIS-SIM-")
    assert receipt["bundleSizeBytes"] > 0
    assert "resourceCounts" in receipt
    assert receipt["resourceCounts"]["Composition"] == 1
    assert receipt["resourceCounts"]["Patient"] == 1
    assert receipt["resourceCounts"]["total"] >= 2
    assert receipt["validation"]["valid"] is True

    # Check that reference ID is deterministic
    res_200_repeat = client.post(f"/api/v1/cases/{completed_case_id}/his-handoff", headers=doc_headers)
    assert res_200_repeat.status_code == 200
    assert res_200_repeat.json()["referenceId"] == receipt["referenceId"]

    # Check audit trail
    res_audit = client.get(f"/api/v1/cases/{completed_case_id}/audit", headers=doc_headers)
    assert res_audit.status_code == 200
    audit_events = [e["eventType"] for e in res_audit.json()]
    assert "his_handoff_simulated" in audit_events

    # 2. Outcome 409: Case not completed
    res_409 = client.post(f"/api/v1/cases/{in_progress_case_id}/his-handoff", headers=doc_headers)
    assert res_409.status_code == 409
    assert "completed" in res_409.json()["detail"].lower()

    # 3. Outcome 403: Caller is non-doctor (patient)
    res_403 = client.post(f"/api/v1/cases/{completed_case_id}/his-handoff", headers=pat_headers)
    assert res_403.status_code == 403

    # 4. Outcome 404: Unknown case
    unknown_id = str(uuid.uuid4())
    res_404 = client.post(f"/api/v1/cases/{unknown_id}/his-handoff", headers=doc_headers)
    assert res_404.status_code == 404


