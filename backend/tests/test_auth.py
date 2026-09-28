import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.case import ClinicalCase
from app.models.document import PatientDocument
from passlib.context import CryptContext
import uuid
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_auth.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    import os
    
    if os.path.exists("./test_auth.db"):
        os.remove("./test_auth.db")
        
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
    if os.path.exists("./test_auth.db"):
        try:
            os.remove("./test_auth.db")
        except:
            pass

def test_unauthenticated_access_rejected():
    response = client.get("/api/v1/cases")
    assert response.status_code == 401

def test_patient_can_access_own_case():
    # Patient creates case
    response = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    assert response.status_code == 201
    data = response.json()
    case_id = data["case"]["caseId"]
    token = data["token"]
    
    # Patient accesses own case
    res2 = client.get(f"/api/v1/cases/{case_id}", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 200
    assert res2.json()["caseId"] == case_id

def test_patient_cannot_access_other_case():
    # Pat 1 creates case
    res1 = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    token1 = res1.json()["token"]
    
    # Pat 2 creates case
    res2 = client.post("/api/v1/cases", json={"patientId": "pat-2", "consentGranted": True})
    case2 = res2.json()["case"]["caseId"]
    
    # Pat 1 tries to access Pat 2 case
    res3 = client.get(f"/api/v1/cases/{case2}", headers={"Authorization": f"Bearer {token1}"})
    assert res3.status_code == 403

def test_doctor_can_access_cases():
    # Login doctor
    res = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc", "password": "pass123"})
    assert res.status_code == 200
    doc_token = res.json()["access_token"]
    
    # Doctor gets cases
    res2 = client.get("/api/v1/cases", headers={"Authorization": f"Bearer {doc_token}"})
    assert res2.status_code == 200


def test_create_case_requires_consent():
    # omitted consent
    response = client.post("/api/v1/cases", json={"patientId": "p-123"})
    assert response.status_code == 400
    assert "consent is required" in response.json()["detail"].lower()

    # consent = false
    response = client.post("/api/v1/cases", json={"patientId": "p-123", "consentGranted": False})
    assert response.status_code == 400
    assert "consent is required" in response.json()["detail"].lower()

    # consent = true
    response = client.post("/api/v1/cases", json={"patientId": "p-123", "consentGranted": True})
    assert response.status_code == 201
    assert response.json()["case"]["consentGranted"] is True
