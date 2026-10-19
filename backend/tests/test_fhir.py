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
    assert bundle["type"] == "collection"
    
    resources = [entry["resource"] for entry in bundle["entry"]]
    resource_types = [r["resourceType"] for r in resources]
    
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
