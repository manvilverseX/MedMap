"""
Regression tests verifying full localization for patient cases (Kannada & Hindi):
- Adaptive intake localized twin fields across general, personal-history, and AYUSH pathways.
- Safety escalation localized twin fields.
- Backend error code dictionary coverage.
"""

from datetime import datetime, timezone
from pathlib import Path
import re
from unittest.mock import patch
import uuid
import pytest
from fastapi.testclient import TestClient

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


def _create_case(db, language: str, answers: dict = None) -> ClinicalCase:
    case = ClinicalCase(
        caseId=f"case-loc-{uuid.uuid4().hex[:8]}",
        patientId=f"P-{uuid.uuid4().hex[:4]}",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language=language,
        status="intake",
        consentGranted=True,
        intakeAnswers=answers or {},
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def test_error_codes_have_dictionary_translations():
    """Verify all backend error codes have KN and HI translations in strings.ts."""
    strings_file = Path(__file__).resolve().parent.parent.parent / "src" / "i18n" / "strings.ts"
    content = strings_file.read_text(encoding="utf-8")

    # Parse HI_STRINGS and KN_STRINGS
    hi_match = re.search(r"export const HI_STRINGS[^=]*=\s*\{(.*?)\};", content, re.DOTALL)
    kn_match = re.search(r"export const KN_STRINGS[^=]*=\s*\{(.*?)\};", content, re.DOTALL)

    assert hi_match and kn_match

    def extract_keys(block):
        return set(re.findall(r"([a-zA-Z0-9_]+)\s*:", block))

    hi_keys = extract_keys(hi_match.group(1))
    kn_keys = extract_keys(kn_match.group(1))

    required_error_codes = [
        "errorNetwork",
        "errorUnauthorized",
        "errorCaseNotFound",
        "errorRateLimit",
        "errorInvalidInput",
        "errorUploadFailed",
        "errorSpeechUnavailable",
        "errorTranslationUnavailable",
        "documentsFileSizeExceeded",
        "documentsUnsupportedFormat",
        "somethingWentWrong",
    ]

    for code in required_error_codes:
        assert code in hi_keys, f"Backend error code '{code}' missing in HI_STRINGS"
        assert code in kn_keys, f"Backend error code '{code}' missing in KN_STRINGS"


@pytest.mark.parametrize("lang,sample_trans", [
    ("kn", "ಸ್ಥಳೀಯ ಪಠ್ಯ"),
    ("hi", "स्थानीय पाठ"),
])
def test_adaptive_intake_localizes_general_pathway(client, test_db, lang, sample_trans):
    """Adaptive intake returns localized twin fields for General pathway questions in kn and hi."""
    case = _create_case(test_db, lang, {"consultation_type": "general"})
    token = _patient_token(case.caseId)

    with patch("app.services.translation_service.translate_texts") as mock_trans:
        mock_trans.side_effect = lambda texts, target_lang, **kw: (
            [f"[{target_lang}] {sample_trans}" for _ in texts],
            True,
        )

        res = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()

        assert data["translated"] is True
        assert data["translationLang"] == lang
        q = data["currentQuestion"]
        assert q is not None
        assert q["promptLocalized"] is not None
        assert sample_trans in q["promptLocalized"]
        assert q["categoryLocalized"] is not None


@pytest.mark.parametrize("lang,sample_trans", [
    ("kn", "ವೈಯಕ್ತಿಕ ಆಹಾರ ಪದ್ಧತಿ"),
    ("hi", "व्यक्तिगत आहार आदतें"),
])
def test_adaptive_intake_localizes_personal_history_pathway(client, test_db, lang, sample_trans):
    """Adaptive intake returns localized twin fields for Personal History questions."""
    case = _create_case(
        test_db,
        lang,
        {
            "consultation_type": "general",
            "chief_complaint": "Headache",
            "present_illness": "Mild headache",
            "hpi_timing": "2 days",
            "hpi_character": "Dull",
            "hpi_severity": "Mild",
            "hpi_radiation": "None",
            "hpi_triggers": "None",
            "hpi_associated": "None",
            "medications": "None",
            "allergies": "None",
            "personal_diet": "Vegetarian",
        },
    )
    token = _patient_token(case.caseId)

    with patch("app.services.translation_service.translate_texts") as mock_trans:
        mock_trans.side_effect = lambda texts, target_lang, **kw: (
            [f"[{target_lang}] {sample_trans}" for _ in texts],
            True,
        )

        res = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=personal_diet",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()

        q = data["currentQuestion"]
        assert q is not None
        assert q["id"] == "personal_diet"
        assert q["promptLocalized"] is not None
        assert sample_trans in q["promptLocalized"]


@pytest.mark.parametrize("lang,sample_trans", [
    ("kn", "ಪ್ರಕೃತಿ ಪರೀಕ್ಷೆ"),
    ("hi", "प्रकृति परीक्षण"),
])
def test_adaptive_intake_localizes_ayush_pathway(client, test_db, lang, sample_trans):
    """Adaptive intake returns localized twin fields for AYUSH pathway questions."""
    case = _create_case(
        test_db,
        lang,
        {
            "consultation_type": "ayush",
            "chief_complaint": "Joint pain",
            "ayush_prakriti": "Vata",
        },
    )
    token = _patient_token(case.caseId)

    with patch("app.services.translation_service.translate_texts") as mock_trans:
        mock_trans.side_effect = lambda texts, target_lang, **kw: (
            [f"[{target_lang}] {sample_trans}" for _ in texts],
            True,
        )

        res = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=ayush_prakriti",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()

        q = data["currentQuestion"]
        assert q is not None
        assert q["id"] == "ayush_prakriti"
        assert q["promptLocalized"] is not None
        assert sample_trans in q["promptLocalized"]
        assert q["optionsLocalized"] is not None
        assert len(q["optionsLocalized"]) > 0


@pytest.mark.parametrize("lang,sample_trans", [
    ("kn", "ತುರ್ತು ವೈದ್ಯಕೀಯ ಗಮನ ಬೇಕಾಗಿದೆ"),
    ("hi", "तत्काल चिकित्सा ध्यान आवश्यक है"),
])
def test_safety_escalation_localization(client, test_db, lang, sample_trans):
    """Safety escalation notice returns localized twin fields."""
    case = _create_case(
        test_db,
        lang,
        {
            "consultation_type": "general",
            "chief_complaint": "Crushing chest pain radiating to left arm with sweating and difficulty breathing",
        },
    )
    token = _patient_token(case.caseId)

    with patch("app.services.translation_service.translate_texts") as mock_trans:
        mock_trans.side_effect = lambda texts, target_lang, **kw: (
            [f"[{target_lang}] {sample_trans}" for _ in texts],
            True,
        )

        res = client.get(
            f"/api/v1/cases/{case.caseId}/adaptive-intake",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()

        assert data["state"] == "safety_escalation"
        assert data["safetyEscalation"] is not None
        esc = data["safetyEscalation"]
        assert esc["headlineLocalized"] is not None
        assert sample_trans in esc["headlineLocalized"]
        assert esc["reasonLocalized"] is not None
        assert esc["guidanceLocalized"] is not None
