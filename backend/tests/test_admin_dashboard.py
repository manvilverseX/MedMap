import pytest
from fastapi.testclient import TestClient
from app.main import app
import uuid
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from passlib.context import CryptContext

client = TestClient(app)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    from app.models.user import User, TokenBlocklist
    from app.models.case import ClinicalCase
    from app.models.event import UnifiedClinicalEvent

    if os.path.exists("./test_admin.db"):
        try:
            os.remove("./test_admin.db")
        except Exception:
            pass

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    # Create admin, doctor, and patient cases
    db = TestingSessionLocal()
    admin_user = User(
        id=str(uuid.uuid4()),
        username="hospital_admin",
        hashed_password=pwd_context.hash("adminsecret123"),
        role="admin",
    )
    doc_user = User(
        id=str(uuid.uuid4()),
        username="hospital_doc",
        hashed_password=pwd_context.hash("docsecret123"),
        role="doctor",
    )
    db.add(admin_user)
    db.add(doc_user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_admin.db"):
        try:
            os.remove("./test_admin.db")
        except Exception:
            pass


def test_admin_login_success():
    response = client.post(
        "/api/v1/auth/admin/login",
        data={"username": "hospital_admin", "password": "adminsecret123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "admin"


def test_doctor_cannot_login_as_admin():
    response = client.post(
        "/api/v1/auth/admin/login",
        data={"username": "hospital_doc", "password": "docsecret123"},
    )
    assert response.status_code == 403
    assert "User is not an admin" in response.json()["detail"]


def test_rbac_admin_queue_access():
    # 1. Unauthenticated -> 401
    res_unauth = client.get("/api/v1/admin/queue")
    assert res_unauth.status_code == 401

    # 2. Patient token -> 403
    res_case = client.post("/api/v1/cases", json={"patientId": "p-admin-rbac", "consentGranted": True})
    patient_token = res_case.json()["token"]

    res_patient = client.get(
        "/api/v1/admin/queue",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert res_patient.status_code == 403

    # 3. Doctor token -> 403
    doc_login = client.post(
        "/api/v1/auth/doctor/login",
        data={"username": "hospital_doc", "password": "docsecret123"},
    )
    doctor_token = doc_login.json()["access_token"]

    res_doctor = client.get(
        "/api/v1/admin/queue",
        headers={"Authorization": f"Bearer {doctor_token}"},
    )
    assert res_doctor.status_code == 403

    # 4. Admin token -> 200
    admin_login = client.post(
        "/api/v1/auth/admin/login",
        data={"username": "hospital_admin", "password": "adminsecret123"},
    )
    admin_token = admin_login.json()["access_token"]

    res_admin = client.get(
        "/api/v1/admin/queue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_admin.status_code == 200
    body = res_admin.json()
    assert "statusCounts" in body
    assert "cases" in body
    assert "redFlagAlerts" in body
    assert body["statusCounts"]["total"] >= 1


def test_admin_acknowledge_alert_and_rbac():
    # Create a case with a simulated red flag
    admin_login = client.post(
        "/api/v1/auth/admin/login",
        data={"username": "hospital_admin", "password": "adminsecret123"},
    )
    admin_token = admin_login.json()["access_token"]

    res_case = client.post("/api/v1/cases", json={"patientId": "p-alert-test", "consentGranted": True})
    case_id = res_case.json()["case"]["caseId"]
    patient_token = res_case.json()["token"]

    # 1. Patient cannot acknowledge
    res_pat_ack = client.post(
        "/api/v1/admin/alerts/acknowledge",
        headers={"Authorization": f"Bearer {patient_token}"},
        json={"caseId": case_id, "category": "Chest Pain"},
    )
    assert res_pat_ack.status_code == 403

    # 2. Doctor cannot acknowledge admin triage alert
    doc_login = client.post(
        "/api/v1/auth/doctor/login",
        data={"username": "hospital_doc", "password": "docsecret123"},
    )
    doc_token = doc_login.json()["access_token"]
    res_doc_ack = client.post(
        "/api/v1/admin/alerts/acknowledge",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={"caseId": case_id, "category": "Chest Pain"},
    )
    assert res_doc_ack.status_code == 403

    # 3. Admin can acknowledge
    res_admin_ack = client.post(
        "/api/v1/admin/alerts/acknowledge",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"caseId": case_id, "category": "Chest Pain", "explanation": "Patient reporting severe radiating pain"},
    )
    assert res_admin_ack.status_code == 200
    assert res_admin_ack.json()["success"] is True

    # 4. Verify audit trail event was logged
    audit_res = client.get(
        f"/api/v1/cases/{case_id}/audit",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert audit_res.status_code == 200
    events = audit_res.json()
    assert any(e["eventType"] == "alert_acknowledged" for e in events)
