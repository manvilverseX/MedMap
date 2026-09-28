import pytest
import os
import json
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.models.base import Base
from app.models.case import ClinicalCase
from app.services import ai_service
from app.core.security import create_access_token
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_ai.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    
    if os.path.exists("./test_ai.db"):
        os.remove("./test_ai.db")
        
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
    if os.path.exists("./test_ai.db"):
        os.remove("./test_ai.db")
    
@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    yield db
    db.close()

@pytest.fixture
def doctor_token():
    return create_access_token(data={"sub": "test-doctor", "role": "doctor"})

@pytest.fixture
def patient_token():
    return create_access_token(data={"role": "patient", "case_id": "test-case-1"})

@pytest.fixture
def test_case(db_session):
    now = datetime.now(timezone.utc)
    case = ClinicalCase(
        caseId="test-case-1",
        patientId="p1",
        createdAt=now,
        updatedAt=now,
        status="doctor_review"
    )
    db_session.add(case)
    db_session.commit()
    yield case
    
    # Teardown
    case_to_delete = db_session.query(ClinicalCase).filter(ClinicalCase.caseId == "test-case-1").first()
    if case_to_delete:
        db_session.delete(case_to_delete)
        db_session.commit()

def test_generate_ai_summary_unauthorized():
    response = client.post("/api/v1/cases/test-case-1/ai-summary")
    assert response.status_code == 401

def test_generate_ai_summary_wrong_patient(patient_token):
    headers = {"Authorization": f"Bearer {patient_token}"}
    response = client.post("/api/v1/cases/wrong-case/ai-summary", headers=headers)
    assert response.status_code == 403

def test_generate_ai_summary_empty_intake(db_session, test_case, doctor_token):
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.post(f"/api/v1/cases/{test_case.caseId}/ai-summary", headers=headers)
    assert response.status_code == 400
    assert "intake answers are empty" in response.json()["detail"]

def test_generate_ai_summary_idempotency(db_session, test_case, doctor_token):
    test_case.aiSummary = {"chiefComplaint": "x", "historyOfPresentIllness": "y", "pastMedicalHistory": "z"}
    db_session.commit()
    
    headers = {"Authorization": f"Bearer {doctor_token}"}
    with patch("app.services.ai_service.generate_clinical_brief") as mock_generate:
        response = client.post(f"/api/v1/cases/{test_case.caseId}/ai-summary", headers=headers)
        assert response.status_code == 200
        mock_generate.assert_not_called()
        assert response.json()["aiSummary"] == test_case.aiSummary

@patch("app.services.ai_service.generate_clinical_brief")
def test_generate_ai_summary_success(mock_generate, db_session, test_case, doctor_token):
    test_case.intakeAnswers = {"Q": "A"}
    db_session.commit()
    
    expected_summary = {
        "chiefComplaint": "A",
        "historyOfPresentIllness": "B",
        "pastMedicalHistory": "C"
    }
    mock_generate.return_value = expected_summary
    
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.post(f"/api/v1/cases/{test_case.caseId}/ai-summary", headers=headers)
    assert response.status_code == 200
    
    data = response.json()
    assert data["aiSummary"] == expected_summary
    
    # Verify DB was updated
    db_session.refresh(test_case)
    assert test_case.aiSummary == expected_summary

@patch("app.services.ai_service.generate_clinical_brief")
def test_generate_ai_summary_failure_does_not_modify_case(mock_generate, db_session, test_case, doctor_token):
    test_case.intakeAnswers = {"Q": "A"}
    test_case.status = "doctor_review"
    db_session.commit()
    
    mock_generate.side_effect = RuntimeError("AI Error")
    
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.post(f"/api/v1/cases/{test_case.caseId}/ai-summary", headers=headers)
    
    assert response.status_code == 502
    
    db_session.refresh(test_case)
    assert test_case.aiSummary is None
    assert test_case.status == "doctor_review"
    assert test_case.intakeAnswers == {"Q": "A"}

@patch("app.services.ai_service.generate_clinical_brief")
def test_generate_ai_summary_validation_error(mock_generate, db_session, test_case, doctor_token):
    test_case.intakeAnswers = {"Q": "A"}
    db_session.commit()
    
    from pydantic import ValidationError
    from app.schemas.case import AISummary
    
    def raise_validation_error(*args, **kwargs):
        AISummary.model_validate_json('{"invalid": "yes"}')
        
    mock_generate.side_effect = raise_validation_error
    
    headers = {"Authorization": f"Bearer {doctor_token}"}
    response = client.post(f"/api/v1/cases/{test_case.caseId}/ai-summary", headers=headers)
    
    assert response.status_code == 502
    assert "malformed response" in response.json()["detail"]
    
    db_session.refresh(test_case)
    assert test_case.aiSummary is None
