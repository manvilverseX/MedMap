"""
Phase 5 Tests: P4 Negative / None Answer Lexicon & allowsNone Rules
Verifies:
1. Every specified none-answer in en, hi, kn, and Latin transliterations is accepted
   for allowsNone questions (e.g. hpi_associated, past_medical, medications).
2. The canonical English clinical value is stored while preserving the original patient text.
3. The relevance LLM is skipped for none-lexicon matches.
4. Gibberish ('asdfgh', '....', 'aaaa') remains rejected 3 times in a row.
5. Chief complaint 'no symptoms' is rejected (allowsNone=False).
6. Emergency text ('ಎದೆ ನೋವು' / 'सीने में दर्द') is immediately escalated without clarification.
"""

from datetime import datetime, timezone
import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.case import ClinicalCase
from app.services.interview_engine.none_answers import (
    allows_none,
    is_none_answer,
    normalize_answer,
    get_canonical_none_value,
    ALLOWS_NONE_MAP,
)


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


def _create_case(db, language: str, initial_answers: dict = None) -> ClinicalCase:
    answers = initial_answers if initial_answers is not None else {"chief_complaint": "Fever and cough"}
    case = ClinicalCase(
        caseId=f"case-none-{uuid.uuid4().hex[:8]}",
        patientId=f"P-{uuid.uuid4().hex[:4]}",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language=language,
        status="intake",
        consentGranted=True,
        intakeAnswers=answers,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@pytest.mark.parametrize("none_phrase", [
    # English
    "No symptoms",
    " No Symptoms ",
    "none",
    "nothing",
    "nil",
    "no",
    "no other symptoms",
    "N/A",
    # Hindi
    "कोई लक्षण नहीं",
    "कोई नहीं",
    "नहीं",
    "कुछ नहीं",
    "नहीं है",
    # Kannada
    "ಯಾವುದೇ ಲಕ್ಷಣಗಳಿಲ್ಲ",
    "ಯಾವುದೂ ಇಲ್ಲ",
    "ಇಲ್ಲ",
    "ಏನೂ ಇಲ್ಲ",
    # Transliterations
    "nahi",
    "kuch nahi",
    "illa",
])
def test_all_none_phrases_accepted_on_allows_none_question(client, test_db, none_phrase):
    """Every specified phrase must be accepted without clarification on hpi_associated."""
    case = _create_case(test_db, language="en")
    token = _patient_token(case.caseId)
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.ai_service.validate_answer_with_llm") as mock_llm:
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={
                "intakeAnswers": {
                    "chief_complaint": "Fever and cough",
                    "hpi_associated": none_phrase,
                }
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        saved = data["intakeAnswers"]["hpi_associated"]
        # Must not need clarification
        assert "clarification_needed" not in saved or saved["clarification_needed"] is None
        # Must store canonical English
        assert saved["value"] == "No other associated symptoms"
        # Must store original text
        assert saved["original"] == none_phrase
        # Must NOT call the relevance LLM
        mock_llm.assert_not_called()


def test_chief_complaint_rejects_no_symptoms(client, test_db):
    """Chief complaint has allowsNone=False; 'no symptoms' must be rejected with ANSWER_INVALID."""
    case = _create_case(test_db, language="en", initial_answers={})
    token = _patient_token(case.caseId)
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        headers=headers,
        json={"intakeAnswers": {"chief_complaint": "No symptoms"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    cc_entry = data["intakeAnswers"]["chief_complaint"]
    assert cc_entry.get("clarification_needed") is not None
    assert cc_entry.get("reason_code") == "ANSWER_INVALID"


@pytest.mark.parametrize("gibberish", ["asdfgh", "....", "aaaa"])
def test_gibberish_rejected_consistently(client, test_db, gibberish):
    """Gibberish must be rejected across multiple attempts with ANSWER_INVALID."""
    case = _create_case(test_db, language="en")
    token = _patient_token(case.caseId)
    headers = {"Authorization": f"Bearer {token}"}

    for attempt in range(1, 4):
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={
                "intakeAnswers": {
                    "chief_complaint": "Persistent cough",
                    "hpi_associated": gibberish,
                }
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        ans = data["intakeAnswers"]["hpi_associated"]
        assert ans.get("clarification_needed") is not None
        assert ans.get("reason_code") == "ANSWER_INVALID"


def test_emergency_text_accepted_and_escalated(client, test_db):
    """Emergency text in Kannada and Hindi must be accepted and escalate immediately without clarification."""
    def fake_translate(text, lang, db=None):
        if "ಎದೆ" in text or "ಉಸಿರಾಟ" in text:
            return "chest pain and shortness of breath", True
        if "सीने" in text:
            return "crushing chest pain", True
        if text == "ತಲೆನೋವು":
            return "headache", True
        if text == "सिरदर्द":
            return "headache", True
        return text, True

    with patch("app.services.translation_service.translate_to_english", side_effect=fake_translate):
        # Kannada chest pain
        case_kn = _create_case(test_db, language="kn", initial_answers={"chief_complaint": "ತಲೆನೋವು"})
        token_kn = _patient_token(case_kn.caseId)
        resp_kn = client.put(
            f"/api/v1/cases/{case_kn.caseId}",
            headers={"Authorization": f"Bearer {token_kn}"},
            json={
                "intakeAnswers": {
                    "chief_complaint": "ತಲೆನೋವು",
                    "hpi_associated": "ಎದೆ ನೋವ ಮತ್ತು ಉಸಿರಾಟದ ತೊಂದರೆ",
                }
            },
        )
        assert resp_kn.status_code == 200
        data_kn = resp_kn.json()
        ans_kn = data_kn["intakeAnswers"]["hpi_associated"]
        assert "clarification_needed" not in ans_kn or ans_kn["clarification_needed"] is None
        # Verify safety escalation triggered
        derived_kn = data_kn.get("derivedClinicalData") or {}
        safety_kn = derived_kn.get("safetyEscalation") or {}
        assert safety_kn.get("isEscalated") is True or safety_kn.get("severity") == "EMERGENCY"

        # Hindi chest pain
        case_hi = _create_case(test_db, language="hi", initial_answers={"chief_complaint": "सिरदर्द"})
        token_hi = _patient_token(case_hi.caseId)
        resp_hi = client.put(
            f"/api/v1/cases/{case_hi.caseId}",
            headers={"Authorization": f"Bearer {token_hi}"},
            json={
                "intakeAnswers": {
                    "chief_complaint": "सिरदर्द",
                    "hpi_associated": "सीने में तेज दर्द है",
                }
            },
        )
        assert resp_hi.status_code == 200
        data_hi = resp_hi.json()
        ans_hi = data_hi["intakeAnswers"]["hpi_associated"]
        assert "clarification_needed" not in ans_hi or ans_hi["clarification_needed"] is None
        derived_hi = data_hi.get("derivedClinicalData") or {}
        safety_hi = derived_hi.get("safetyEscalation") or {}
        assert safety_hi.get("isEscalated") is True or safety_hi.get("severity") == "EMERGENCY"
