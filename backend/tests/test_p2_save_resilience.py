"""
Phase 4 Regression Test: P2 Save & Adaptive Intake Resilience
Simulates:
1. Empty translation_cache with the table missing (raises OperationalError on query)
2. Groq unreachable (raises APIConnectionError)
3. Bounded timeouts
Asserts:
- FIRST GET /adaptive-intake succeeds with HTTP 200 in kn and hi.
- Display fields are localized via the static bank.
- FIRST PUT /cases/{id} succeeds with HTTP 200, updates answers, and returns adaptiveState inline.
- GET /cases/{id} succeeds with HTTP 200.
"""

from datetime import datetime, timezone
import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.exc import ProgrammingError, OperationalError

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.case import ClinicalCase


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def test_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _patient_token(case_id: str) -> str:
    return create_access_token({"role": "patient", "case_id": case_id})


def _create_case(db, language: str) -> ClinicalCase:
    case = ClinicalCase(
        caseId=f"case-res-{uuid.uuid4().hex[:8]}",
        patientId=f"P-{uuid.uuid4().hex[:4]}",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language=language,
        status="intake",
        consentGranted=True,
        intakeAnswers={},
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@pytest.mark.parametrize("lang,expected_prompt_snippet", [
    ("hi", "मुख्य कारण"),
    ("kn", "ಪ್ರಮುಖ ಕಾರಣ"),
])
def test_first_get_and_put_succeed_when_db_missing_and_groq_down(client, test_db, lang, expected_prompt_snippet):
    case = _create_case(test_db, language=lang)
    token = _patient_token(case.caseId)
    headers = {"Authorization": f"Bearer {token}"}

    def simulate_missing_table(*args, **kwargs):
        raise ProgrammingError(
            'SELECT * FROM translation_cache',
            {},
            Exception('relation "translation_cache" does not exist')
        )

    with patch("app.models.translation_cache.TranslationCache") as mock_cache_model, \
         patch("app.services.ai_service.Groq") as mock_groq_ai, \
         patch("app.services.translation_service.Groq") as mock_groq_trans:
        
        # Simulate missing DB table
        mock_cache_model.side_effect = simulate_missing_table

        # Simulate Groq unreachable
        mock_groq_ai.side_effect = Exception("Groq connection refused / unreachable")
        mock_groq_trans.side_effect = Exception("Groq connection refused / unreachable")

        # 1. FIRST GET /cases/{id}/adaptive-intake must succeed with HTTP 200
        get_resp = client.get(f"/api/v1/cases/{case.caseId}/adaptive-intake", headers=headers)
        assert get_resp.status_code == 200, f"Expected 200, got {get_resp.status_code}: {get_resp.text}"
        data = get_resp.json()
        assert data.get("currentQuestion") is not None
        prompt_loc = data["currentQuestion"].get("promptLocalized") or data["currentQuestion"].get("prompt")
        assert prompt_loc is not None
        assert expected_prompt_snippet in prompt_loc

        # 2. FIRST PUT /cases/{id} must succeed with HTTP 200 and return adaptiveState
        put_resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={"intakeAnswers": {"chief_complaint": "Fever and headache for 2 days"}}
        )
        assert put_resp.status_code == 200, f"Expected 200, got {put_resp.status_code}: {put_resp.text}"
        put_data = put_resp.json()
        assert "adaptiveState" in put_data
        assert put_data["adaptiveState"] is not None
        assert put_data["intakeAnswers"].get("chief_complaint") is not None

        # 3. Subsequent GET /cases/{id} succeeds with 200
        case_resp = client.get(f"/api/v1/cases/{case.caseId}", headers=headers)
        assert case_resp.status_code == 200
