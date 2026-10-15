import pytest
import os
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.models.base import Base
from app.models.case import ClinicalCase
from app.core.security import create_access_token
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_ci.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db

    if os.path.exists("./test_ci.db"):
        os.remove("./test_ci.db")

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    engine.dispose()
    if os.path.exists("./test_ci.db"):
        try:
            os.remove("./test_ci.db")
        except PermissionError:
            pass

@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    yield db
    db.close()

@pytest.fixture
def doctor_token():
    return create_access_token(data={"sub": "test-doctor", "role": "doctor"})

@pytest.fixture
def unauthorized_doctor_token():
    return create_access_token(data={"sub": "unauth-doctor", "role": "doctor"})

@pytest.fixture
def patient_token():
    return create_access_token(data={"role": "patient", "case_id": "test-case-ci-1"})

@pytest.fixture
def test_case_positive(db_session):
    now = datetime.now(timezone.utc)
    case = ClinicalCase(
        caseId="test-case-ci-positive",
        patientId="p1",
        createdAt=now,
        updatedAt=now,
        status="doctor_review",
        intakeAnswers={
            "chief_complaint": "I have severe chest pain",
            "allergies_reaction": "anaphylaxis to peanuts"
        }
    )
    db_session.add(case)
    db_session.commit()
    yield case

    case_to_delete = db_session.query(ClinicalCase).filter(ClinicalCase.caseId == "test-case-ci-positive").first()
    if case_to_delete:
        db_session.delete(case_to_delete)
        db_session.commit()

@pytest.fixture
def test_case_empty(db_session):
    now = datetime.now(timezone.utc)
    case = ClinicalCase(
        caseId="test-case-ci-empty",
        patientId="p2",
        createdAt=now,
        updatedAt=now,
        status="doctor_review",
        intakeAnswers={
            "chief_complaint": "I have a mild headache",
            "allergies_reaction": "none"
        }
    )
    db_session.add(case)
    db_session.commit()
    yield case

    case_to_delete = db_session.query(ClinicalCase).filter(ClinicalCase.caseId == "test-case-ci-empty").first()
    if case_to_delete:
        db_session.delete(case_to_delete)
        db_session.commit()

def test_ci_positive_case(test_case_positive, doctor_token):
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.get(f"/api/v1/cases/{test_case_positive.caseId}/clinical-intelligence", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "redFlags" in data
    assert len(data["redFlags"]) == 2
    categories = [f["category"] for f in data["redFlags"]]
    assert "allergy" in categories
    assert "cardiac" in categories
    assert data["redFlags"][0]["severity"] in ["CRITICAL", "HIGH"]

def test_ci_empty_case(test_case_empty, doctor_token):
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.get(f"/api/v1/cases/{test_case_empty.caseId}/clinical-intelligence", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "redFlags" in data
    assert len(data["redFlags"]) == 0
    assert "medicationIntelligence" in data
    assert len(data["medicationIntelligence"]) == 0

def test_ci_unauthorized(test_case_positive):
    response = client.get(f"/api/v1/cases/{test_case_positive.caseId}/clinical-intelligence")
    assert response.status_code == 401

def test_ci_nonexistent_case(doctor_token):
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.get("/api/v1/cases/does-not-exist/clinical-intelligence", headers=headers)
    assert response.status_code == 404

def test_ci_wrong_patient(patient_token):
    headers = {"Authorization": f"Bearer {patient_token}"}
    response = client.get("/api/v1/cases/wrong-case/clinical-intelligence", headers=headers)
    assert response.status_code == 403
