import pytest
from fastapi.testclient import TestClient
from app.main import app
import uuid
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

client = TestClient(app)

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_abdm.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    from app.models.user import User, TokenBlocklist
    from app.models.case import ClinicalCase
    
    if os.path.exists("./test_abdm.db"):
        try: os.remove("./test_abdm.db")
        except: pass
        
    Base.metadata.create_all(bind=engine)
    
    def override_get_db():
        session = TestingSessionLocal()
        try: yield session
        finally: session.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_abdm.db"):
        try: os.remove("./test_abdm.db")
        except: pass

def test_abdm_sandbox_verify_success():
    res = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    token = res.json()["token"]
    
    response = client.post(
        "/api/v1/abdm/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"abhaId": "test-1234-5678"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["mode"] == "simulation"
    assert data["data"]["abhaId"] == "test-1234-5678"

def test_abdm_sandbox_verify_invalid():
    res = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    token = res.json()["token"]
    
    response = client.post(
        "/api/v1/abdm/verify",
        headers={"Authorization": f"Bearer {token}"},
        json={"abhaId": "123"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid ABHA ID format"

def test_abdm_sandbox_link_success():
    # 1. Login as patient
    res = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    token = res.json()["token"]
    case_id = res.json()["case"]["caseId"]
    
    # 3. Link context
    link_res = client.post(
        "/api/v1/abdm/link-context",
        headers={"Authorization": f"Bearer {token}"},
        json={"abhaId": "test-1234-5678", "caseId": case_id}
    )
    assert link_res.status_code == 200
    data = link_res.json()
    assert data["success"] is True
    assert data["data"]["status"] == "linked"
    assert data["data"]["caseId"] == case_id

def test_abdm_sandbox_link_unauthorized():
    # Login as patient 1
    res1 = client.post("/api/v1/cases", json={"patientId": "pat-1", "consentGranted": True})
    token1 = res1.json()["token"]
    case_id = res1.json()["case"]["caseId"]
    
    # Login as patient 2
    res2 = client.post("/api/v1/cases", json={"patientId": "pat-2", "consentGranted": True})
    token2 = res2.json()["token"]
    
    # Patient 2 tries to link Patient 1's case
    link_res = client.post(
        "/api/v1/abdm/link-context",
        headers={"Authorization": f"Bearer {token2}"},
        json={"abhaId": "test-1234-5678", "caseId": case_id}
    )
    assert link_res.status_code == 403
    assert link_res.json()["detail"] == "Not authorized to link this case"
