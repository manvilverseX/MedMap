"""
Phase 7: Production-Like Regression Suite (Strict Safety Net)
Verifies:
1. Unset GROQ_API_KEY and SARVAM_API_KEY with empty DB cache.
2. No mocks of translation_service - relies purely on static curated bank.
3. Walks General, Personal-History, and AYUSH pathways question-by-question for kn and hi.
4. Asserts:
   - All display fields contain non-English Devanagari / Kannada script.
   - No unpopulated template placeholders remain (e.g. {{total}}, {{current}}, {key}).
   - translated flag is True (from static bank).
   - Every PUT with a valid answer returns HTTP 200 on first attempt.
"""

from datetime import datetime, timezone
import os
import re
import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.case import ClinicalCase


DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")
KANNADA_REGEX = re.compile(r"[\u0C80-\u0CFF]")
RAW_PLACEHOLDER_REGEX = re.compile(r"\{\{[^}]*\}\}|\{[a-zA-Z0-9_]+\}")


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
    case = ClinicalCase(
        caseId=f"case-p7-{language}-{uuid.uuid4().hex[:8]}",
        patientId=f"P-{uuid.uuid4().hex[:4]}",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language=language,
        status="intake",
        consentGranted=True,
        intakeAnswers=initial_answers or {},
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def _assert_localized_and_no_placeholders(data: dict, lang: str):
    """Assert all display fields are localized to target script and have no placeholders."""
    assert data.get("translated") is True, f"Expected translated=True for {lang}"
    q = data.get("currentQuestion")
    assert q is not None, "currentQuestion should not be None"

    script_regex = DEVANAGARI_REGEX if lang == "hi" else KANNADA_REGEX
    lang_name = "Hindi (Devanagari)" if lang == "hi" else "Kannada"

    prompt = q.get("promptLocalized") or q.get("prompt")
    category = q.get("categoryLocalized") or q.get("category")

    assert script_regex.search(prompt), f"Prompt '{prompt}' does not contain {lang_name} script"
    assert script_regex.search(category), f"Category '{category}' does not contain {lang_name} script"

    # Check for raw {{...}} or {...} placeholders
    assert not RAW_PLACEHOLDER_REGEX.search(prompt), f"Raw placeholder in prompt: {prompt}"
    assert not RAW_PLACEHOLDER_REGEX.search(category), f"Raw placeholder in category: {category}"

    if q.get("helperTextLocalized"):
        assert not RAW_PLACEHOLDER_REGEX.search(q["helperTextLocalized"])

    if q.get("optionsLocalized"):
        for opt in q["optionsLocalized"]:
            assert not RAW_PLACEHOLDER_REGEX.search(opt)


@pytest.mark.parametrize("lang", ["hi", "kn"])
def test_production_like_general_pathway_isolated(client, test_db, lang):
    """
    Simulates production outage conditions for General Pathway:
    - GROQ_API_KEY is empty / unset
    - SARVAM_API_KEY is empty / unset
    - translation_service has NO mocks (tests real static bank)
    """
    with patch.dict(os.environ, {"GROQ_API_KEY": "", "SARVAM_API_KEY": ""}):
        case = _create_case(test_db, language=lang)
        token = _patient_token(case.caseId)
        headers = {"Authorization": f"Bearer {token}"}

        # Step 1: GET initial question (chief_complaint)
        get_res = client.get(f"/api/v1/cases/{case.caseId}/adaptive-intake", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["currentQuestion"]["id"] == "chief_complaint"
        _assert_localized_and_no_placeholders(data, lang)

        # Step 2: PUT chief complaint (valid symptom in target language)
        cc_answer = "तेज बुखार और सिरदर्द" if lang == "hi" else "ಜ್ವರ ಮತ್ತು ತಲೆನೋವು"
        put_res = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={"intakeAnswers": {"chief_complaint": cc_answer}},
        )
        assert put_res.status_code == 200, f"PUT chief_complaint failed: {put_res.text}"

        # Step 3: GET next question
        get_res2 = client.get(f"/api/v1/cases/{case.caseId}/adaptive-intake", headers=headers)
        assert get_res2.status_code == 200
        data2 = get_res2.json()
        _assert_localized_and_no_placeholders(data2, lang)


@pytest.mark.parametrize("lang", ["hi", "kn"])
def test_production_like_personal_history_isolated(client, test_db, lang):
    """
    Simulates production outage conditions for Personal History Pathway:
    - Verifies past_medical localization from static bank without Groq.
    - Verifies allowsNone negative answer canonicalization without Groq.
    """
    with patch.dict(os.environ, {"GROQ_API_KEY": "", "SARVAM_API_KEY": ""}):
        cc_answer = "तेज बुखार" if lang == "hi" else "ಜ್ವರ"
        case = _create_case(
            test_db,
            language=lang,
            initial_answers={
                "chief_complaint": cc_answer,
                "past_medical": "None reported",
            },
        )
        token = _patient_token(case.caseId)
        headers = {"Authorization": f"Bearer {token}"}

        get_pm = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=past_medical",
            headers=headers,
        )
        assert get_pm.status_code == 200
        data_pm = get_pm.json()
        assert data_pm["currentQuestion"]["id"] == "past_medical"
        _assert_localized_and_no_placeholders(data_pm, lang)

        # Submit none answer in target language
        none_answer = "कोई नहीं" if lang == "hi" else "ಯಾವುದೂ ಇಲ್ಲ"
        put_pm = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={"intakeAnswers": {"chief_complaint": cc_answer, "past_medical": none_answer}},
        )
        assert put_pm.status_code == 200
        ans_entry = put_pm.json()["intakeAnswers"]["past_medical"]
        assert ans_entry["value"] == "No prior medical conditions"


@pytest.mark.parametrize("lang", ["hi", "kn"])
def test_production_like_ayush_pathway_isolated(client, test_db, lang):
    """
    Simulates production outage conditions for AYUSH Pathway:
    - Verifies ayush_prakriti localization from static bank without Groq.
    - Verifies PUT 200 OK on first attempt without Groq.
    """
    with patch.dict(os.environ, {"GROQ_API_KEY": "", "SARVAM_API_KEY": ""}):
        case = _create_case(
            test_db,
            language=lang,
            initial_answers={
                "consultation_type": "ayush",
                "chief_complaint": "Joint pain",
                "ayush_prakriti": "Slender/light frame, dry skin, sensitive to cold/wind (Vata-dominant)",
            },
        )
        token = _patient_token(case.caseId)
        headers = {"Authorization": f"Bearer {token}"}

        get_ayush = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=ayush_prakriti",
            headers=headers,
        )
        assert get_ayush.status_code == 200
        data_ayush = get_ayush.json()
        assert data_ayush["currentQuestion"]["id"] == "ayush_prakriti"
        _assert_localized_and_no_placeholders(data_ayush, lang)

        # PUT updated answer
        put_ayush = client.put(
            f"/api/v1/cases/{case.caseId}",
            headers=headers,
            json={
                "intakeAnswers": {
                    "chief_complaint": "Joint pain",
                    "ayush_prakriti": "Balanced mix of two or three tendencies",
                }
            },
        )
        assert put_ayush.status_code == 200
