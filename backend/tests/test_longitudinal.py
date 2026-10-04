import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.case import ClinicalCase
import uuid
from datetime import datetime, timezone, timedelta

from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_longitudinal.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    import os
    from passlib.context import CryptContext
    from app.models.user import User
    
    if os.path.exists("./test_longitudinal.db"):
        os.remove("./test_longitudinal.db")
        
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
    if os.path.exists("./test_longitudinal.db"):
        try:
            os.remove("./test_longitudinal.db")
        except:
            pass

def test_longitudinal_unified_case():
    db_session = TestingSessionLocal()
    patient_id = "pat-long-1"
    
    # Visit 1
    case1_id = str(uuid.uuid4())
    case1 = ClinicalCase(
        caseId=case1_id,
        patientId=patient_id,
        createdAt=datetime.now(timezone.utc) - timedelta(days=30),
        updatedAt=datetime.now(timezone.utc) - timedelta(days=30),
        status="completed",
        consentGranted=True,
        aiSummary={"chiefComplaint": "Fever"},
        derivedClinicalData={
            "medicalEntities": {
                "medications": [{"name": "Paracetamol", "dose": "500mg"}]
            }
        }
    )
    db_session.add(case1)
    
    # Visit 2
    case2_id = str(uuid.uuid4())
    case2 = ClinicalCase(
        caseId=case2_id,
        patientId=patient_id,
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        status="completed",
        consentGranted=True,
        aiSummary={"chiefComplaint": "Cough"},
        derivedClinicalData={
            "medicalEntities": {
                "medications": [{"name": "Ibuprofen", "dose": "200mg"}]
            }
        }
    )
    db_session.add(case2)
    db_session.commit()
    
    # Generate token
    res = client.post("/api/v1/auth/doctor/login", data={"username": "testdoc", "password": "pass123"})
    token = res.json()["access_token"]
    
    # Hit unified endpoint
    res_unified = client.get(f"/api/v1/cases/{case2_id}/unified", headers={"Authorization": f"Bearer {token}"})
    assert res_unified.status_code == 200
    unified = res_unified.json()
    
    assert unified["patient"]["patientId"] == patient_id
    assert unified["currentEncounter"]["caseId"] == case2_id
    assert unified["previousVerified"]["caseId"] == case1_id
    
    changes = unified["longitudinalChanges"]
    assert "fever" in changes["symptoms"]["resolved"]
    assert "cough" in changes["symptoms"]["new"]
    
    assert "paracetamol" in changes["medications"]["stopped"]
    assert "ibuprofen" in changes["medications"]["started"]
    
    assert len(unified["timeline"]) == 2
