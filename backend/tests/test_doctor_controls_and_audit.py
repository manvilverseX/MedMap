import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.base import Base
from app.models.case import ClinicalCase
from app.models.evidence import Evidence
from app.models.event import UnifiedClinicalEvent
from app.models.user import User
from passlib.context import CryptContext

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_audit.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_audit_db():
    import os
    if os.path.exists("./test_audit.db"):
        try:
            os.remove("./test_audit.db")
        except Exception:
            pass

    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    doc = User(id=str(uuid.uuid4()), username="auditdoc", hashed_password=pwd_context.hash("pass123"), role="doctor")
    adm = User(id=str(uuid.uuid4()), username="auditadmin", hashed_password=pwd_context.hash("pass123"), role="admin")
    db.add(doc)
    db.add(adm)
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
    if os.path.exists("./test_audit.db"):
        try:
            os.remove("./test_audit.db")
        except Exception:
            pass


def test_patient_cannot_access_audit_log():
    """Verify that a patient token cannot access the audit trail endpoint (403 Forbidden)."""
    case_id = str(uuid.uuid4())
    patient_token = create_access_token({"role": "patient", "case_id": case_id})

    res = client.get(
        f"/api/v1/cases/{case_id}/audit",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert res.status_code == 403
    assert "Operation not permitted" in res.json()["detail"]


def test_full_clinical_audit_lifecycle_and_doctor_controls():
    """Verify end-to-end audit trail capture and doctor accept/edit/reject controls."""
    db = TestingSessionLocal()

    # 1. Doctor login
    res = client.post("/api/v1/auth/doctor/login", data={"username": "auditdoc", "password": "pass123"})
    assert res.status_code == 200
    doc_token = res.json()["access_token"]

    # 2. Patient creates case (should log case_created and consent_granted)
    res_create = client.post("/api/v1/cases", json={"patientId": "pat-audit-1", "consentGranted": True})
    assert res_create.status_code == 201
    case_data = res_create.json()["case"]
    case_id = case_data["caseId"]
    pat_token = res_create.json()["token"]

    # Seed extracted medical entities
    db_case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    db_case.derivedClinicalData = {
        "medicalEntities": {
            "diagnoses": ["Hypertension", "Type 2 Diabetes"],
            "medications": [
                {"name": "Amlodipine", "dose": "5mg", "frequency": "once daily"},
                {"name": "Metformin", "dose": "500mg", "frequency": "twice daily"},
            ],
            "investigations": [
                {"testName": "HbA1c", "value": "7.5", "unit": "%"},
                {"testName": "Urine Albumin", "value": "Normal", "unit": None},
            ],
        }
    }
    db.commit()

    # 3. Patient updates answers
    res_ans = client.put(
        f"/api/v1/cases/{case_id}",
        json={"intakeAnswers": {"chief_complaint": "Persistent elevated blood sugar"}},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res_ans.status_code == 200

    # 4. Transition intake -> patient_verifying -> doctor_review
    res_intake_done = client.put(
        f"/api/v1/cases/{case_id}",
        json={"status": "patient_verifying"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res_intake_done.status_code == 200

    # Patient verifies responses
    res_verify = client.put(
        f"/api/v1/cases/{case_id}",
        json={"status": "doctor_review"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res_verify.status_code == 200

    # 5. Doctor accepts first medication (Amlodipine)
    res_accept = client.post(
        f"/api/v1/cases/{case_id}/review-item",
        json={
            "itemType": "medications",
            "itemId": "0",
            "action": "accepted",
            "originalValue": {"name": "Amlodipine", "dose": "5mg"},
            "snippet": "Rx: Tab Amlodipine 5mg OD",
            "pageLocation": "Page 1",
        },
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_accept.status_code == 200
    assert res_accept.json()["review"]["action"] == "accepted"

    # 6. Doctor rejects second diagnosis (Type 2 Diabetes)
    res_reject = client.post(
        f"/api/v1/cases/{case_id}/review-item",
        json={
            "itemType": "diagnoses",
            "itemId": "1",
            "action": "rejected",
            "originalValue": "Type 2 Diabetes",
            "snippet": "Rule out T2DM",
            "pageLocation": "Page 1",
        },
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["review"]["action"] == "rejected"

    # 7. Doctor edits second medication (Metformin -> Metformin ER 1000mg)
    res_edit = client.post(
        f"/api/v1/cases/{case_id}/review-item",
        json={
            "itemType": "medications",
            "itemId": "1",
            "action": "edited",
            "originalValue": {"name": "Metformin", "dose": "500mg"},
            "reviewedValue": {"name": "Metformin ER", "dose": "1000mg", "frequency": "once daily bedtime"},
            "snippet": "Increased dose to 1000mg ER",
            "pageLocation": "Page 2",
        },
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_edit.status_code == 200
    assert res_edit.json()["review"]["action"] == "edited"

    # Verify evidence persistence in DB
    evidence_items = db.query(Evidence).all()
    assert len(evidence_items) >= 3
    diag_evidence = next(e for e in evidence_items if e.fieldPath == "diagnoses.1")
    assert diag_evidence.verificationStatus == "rejected"

    # 8. Doctor finalizes case
    res_final = client.put(
        f"/api/v1/cases/{case_id}",
        json={"status": "completed", "clinicalAssessment": {"diagnosis": "Hypertension"}},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_final.status_code == 200
    assert res_final.json()["status"] == "completed"

    # 9. FHIR export and verify that doctor reviews are honored
    res_fhir = client.get(
        f"/api/v1/cases/{case_id}/fhir",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_fhir.status_code == 200
    bundle = res_fhir.json()

    conditions = [e["resource"]["code"]["text"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Condition"]
    # "Type 2 Diabetes" was rejected by doctor -> MUST NOT appear in FHIR bundle
    assert "Type 2 Diabetes" not in conditions

    meds = [e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "MedicationRequest"]
    med_names = [m["medicationCodeableConcept"]["text"] for m in meds]
    # "Metformin ER" was edited by doctor -> MUST use edited state
    assert "Metformin ER" in med_names

    # 10. ABDM mock link context
    res_abdm = client.post(
        "/api/v1/abdm/link-context",
        json={"abhaId": "test@abdm", "caseId": case_id},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_abdm.status_code == 200

    # 11. Fetch Audit Trail via GET /cases/{id}/audit
    res_audit = client.get(
        f"/api/v1/cases/{case_id}/audit",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res_audit.status_code == 200
    audit_events = res_audit.json()
    event_types = [e["eventType"] for e in audit_events]

    # Verify all required event types exist
    assert "case_created" in event_types
    assert "consent_granted" in event_types
    assert "answers_updated" in event_types
    assert "patient_verified" in event_types
    assert "doctor_decision" in event_types
    assert "case_finalized" in event_types
    assert "fhir_exported" in event_types
    assert "abdm_mock_action" in event_types
