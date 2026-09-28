import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
import uuid
import os

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_transitions.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db

    if os.path.exists("./test_transitions.db"):
        os.remove("./test_transitions.db")

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    doctor = User(id=str(uuid.uuid4()), username="testdoc_trans", hashed_password=pwd_context.hash("pass123"), role="doctor")
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
    if os.path.exists("./test_transitions.db"):
        try:
            os.remove("./test_transitions.db")
        except:
            pass

@pytest.fixture
def doc_token():
    res = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc_trans", "password": "pass123"})
    assert res.status_code == 200
    return res.json()["access_token"]

def test_valid_transitions(doc_token):
    # Patient creates case (starts as INTAKE)
    res = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    assert res.status_code == 201
    data = res.json()
    case_id = data["case"]["caseId"]
    pat_token = data["token"]

    # INTAKE -> PATIENT_VERIFYING (Doctor doing it)
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "patient_verifying"})
    assert res.status_code == 200
    assert res.json()["status"] == "patient_verifying"

    # PATIENT_VERIFYING -> DOCTOR_REVIEW
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "doctor_review"})
    assert res.status_code == 200
    assert res.json()["status"] == "doctor_review"

    # DOCTOR_REVIEW -> COMPLETED
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "completed"})
    assert res.status_code == 200
    assert res.json()["status"] == "completed"

def test_patient_can_verify_and_submit_case():
    # Patient creates case (starts as INTAKE)
    res = client.post("/api/v1/cases", json={"patientId": "pat-10", "consentGranted": True})
    assert res.status_code == 201
    data = res.json()
    case_id = data["case"]["caseId"]
    pat_token = data["token"]

    # INTAKE -> PATIENT_VERIFYING (Patient doing it during verification screen)
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {pat_token}"}, json={"status": "patient_verifying"})
    assert res.status_code == 200
    assert res.json()["status"] == "patient_verifying"

    # PATIENT_VERIFYING -> DOCTOR_REVIEW (Patient confirms information)
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {pat_token}"}, json={"status": "doctor_review"})
    assert res.status_code == 200
    assert res.json()["status"] == "doctor_review"

def test_invalid_intake_to_completed(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-2", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    # INTAKE -> COMPLETED is invalid
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "completed"})
    assert res.status_code == 400
    assert "Invalid state transition" in res.json()["detail"]

def test_invalid_patient_verifying_to_completed(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-3", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "patient_verifying"})

    # PATIENT_VERIFYING -> COMPLETED is invalid
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "completed"})
    assert res.status_code == 400
    assert "Invalid state transition" in res.json()["detail"]

def test_invalid_transition_from_completed(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-4", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "patient_verifying"})
    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "doctor_review"})
    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "completed"})

    # COMPLETED -> DOCTOR_REVIEW is invalid
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "doctor_review"})
    assert res.status_code == 400
    assert "Invalid state transition" in res.json()["detail"]

def test_patient_cannot_perform_doctor_review_to_completed(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-5", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]
    pat_token = res.json()["token"]

    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "patient_verifying"})
    client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"status": "doctor_review"})

    # Patient tries to mark as completed
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {pat_token}"}, json={"status": "completed"})
    assert res.status_code == 403
    assert "Patients cannot mark case as completed" in res.json()["detail"]

def test_doctor_derives_reviewer_id(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-6", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    # Send clinical assessment as doctor
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"clinicalAssessment": {"diagnosis": "Healthy"}})
    assert res.status_code == 200
    assert res.json()["reviewerId"] == "testdoc_trans"
    assert res.json()["clinicalAssessment"] == {"diagnosis": "Healthy"}

def test_doctor_cannot_spoof_reviewer_id(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-7", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    # Try to spoof reviewerId
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {doc_token}"}, json={"clinicalAssessment": {"diagnosis": "Healthy"}, "reviewerId": "fake_doc"})
    assert res.status_code == 200
    assert res.json()["reviewerId"] == "testdoc_trans" # Should be overwritten by server

def test_patient_cannot_submit_clinical_assessment():
    res = client.post("/api/v1/cases", json={"patientId": "pat-8", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]
    pat_token = res.json()["token"]

    # Try to submit clinical assessment as patient
    res = client.put(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {pat_token}"}, json={"clinicalAssessment": {"diagnosis": "Healthy"}})
    assert res.status_code == 403
    assert "Patients cannot modify doctor review fields" in res.json()["detail"]

def test_patient_cannot_modify_derived_clinical_data():
    res = client.post("/api/v1/cases", json={"patientId": "pat-derived", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]
    pat_token = res.json()["token"]

    res = client.put(
        f"/api/v1/cases/{case_id}",
        headers={"Authorization": f"Bearer {pat_token}"},
        json={"derivedClinicalData": {"history": {"chiefComplaint": "Headache"}}},
    )
    assert res.status_code == 403
    assert "server-controlled" in res.json()["detail"]

def test_doctor_cannot_modify_derived_clinical_data(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-derived-doctor", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    res = client.put(
        f"/api/v1/cases/{case_id}",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={"derivedClinicalData": {"history": {"chiefComplaint": "Headache"}}},
    )
    assert res.status_code == 403
    assert "server-controlled" in res.json()["detail"]

def test_malformed_derived_clinical_data_is_rejected(doc_token):
    res = client.post("/api/v1/cases", json={"patientId": "pat-derived-invalid", "consentGranted": True})
    case_id = res.json()["case"]["caseId"]

    res = client.put(
        f"/api/v1/cases/{case_id}",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={"derivedClinicalData": ["not", "an", "object"]},
    )
    assert res.status_code == 422
