import json
import re
import os
from datetime import datetime, timezone
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.case import ClinicalCase
from app.services.interview_engine.none_answers import allows_none, is_none_answer, get_canonical_none_value
from app.services.adaptive_intake import validate_clinical_answer, INTAKE_QUESTIONS
from app.services.interview_engine.ayush_questions import AYUSH_QUESTIONS

DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")
KANNADA_REGEX = re.compile(r"[\u0C80-\u0CFF]")
PLACEHOLDER_REGEX = re.compile(r"\{\{([^}]+)\}\}|\{([a-zA-Z0-9_]+)\}")


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


def test_phase5_question_configuration():
    """Verify allowsNone and placement for the 3 new questions."""
    assert allows_none("previous_investigations") is True
    assert allows_none("other_history") is True
    assert allows_none("ayush_samprapti") is False

    # Check canonical none values
    assert get_canonical_none_value("previous_investigations", "None") == "None / not sure"
    assert get_canonical_none_value("other_history", "Nothing else") == "Nothing else"

    # Order in general pathway: review_of_systems -> previous_investigations -> other_history
    q_ids = [q.id for q in INTAKE_QUESTIONS]
    ros_idx = q_ids.index("review_of_systems")
    prev_inv_idx = q_ids.index("previous_investigations")
    other_idx = q_ids.index("other_history")

    assert prev_inv_idx == ros_idx + 1
    assert other_idx == prev_inv_idx + 1

    # AYUSH has ayush_samprapti
    ayush_ids = [q.id for q in AYUSH_QUESTIONS]
    assert "ayush_samprapti" in ayush_ids


def test_phase5_translations_programmatic_verification():
    """Programmatically verify static bank and frontend dictionary entries for hi and kn."""
    bank_path = os.path.join(os.path.dirname(__file__), "..", "app", "data", "curated_translations_hi_kn.json")
    with open(bank_path, "r", encoding="utf-8") as f:
        bank = json.load(f)

    # Check key prompts in static bank
    required_prompts = [
        "Have you had any tests or scans before for this problem or others? For example blood tests, X-ray, scan, ECG.",
        "Is there anything else about your health you want the doctor to know?",
        "How did your illness start and progress? What makes it better or worse (such as food, season, stress, or sleep), and did it come on gradually or suddenly?",
    ]

    for p in required_prompts:
        assert p in bank, f"Missing prompt in static bank: {p}"
        entry = bank[p]
        assert entry.get("hi"), f"Empty Hindi for {p}"
        assert entry.get("kn"), f"Empty Kannada for {p}"
        assert DEVANAGARI_REGEX.search(entry["hi"]), f"Hindi does not contain Devanagari: {entry['hi']}"
        assert KANNADA_REGEX.search(entry["kn"]), f"Kannada does not contain Kannada script: {entry['kn']}"

        # Placeholders
        src_ph = set(PLACEHOLDER_REGEX.findall(p))
        hi_ph = set(PLACEHOLDER_REGEX.findall(entry["hi"]))
        kn_ph = set(PLACEHOLDER_REGEX.findall(entry["kn"]))
        assert src_ph == hi_ph
        assert src_ph == kn_ph


@pytest.mark.parametrize("lang", ["hi", "kn"])
def test_production_like_walkthrough_with_new_questions(client, test_db, lang):
    """Walkthrough in hi and kn with GROQ and SARVAM unset, ensuring new questions are reached and localized."""
    with patch.dict(os.environ, {"GROQ_API_KEY": "", "SARVAM_API_KEY": ""}):
        now = datetime.now(timezone.utc)
        case = ClinicalCase(
            caseId=f"case-p5-{lang}-{int(now.timestamp())}",
            patientId="P-P5-TEST",
            createdAt=now,
            updatedAt=now,
            language=lang,
            status="intake",
            consentGranted=True,
            intakeAnswers={
                "chief_complaint": "तेज बुखार" if lang == "hi" else "ಜ್ವರ",
                "previous_investigations": "Initial",
                "other_history": "Initial",
                "ayush_samprapti": "Initial",
            },
        )
        test_db.add(case)
        test_db.commit()

        try:
            token = _patient_token(case.caseId)
            headers = {"Authorization": f"Bearer {token}"}

            # Query previous_investigations in correction mode
            res_pi = client.get(
                f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=previous_investigations",
                headers=headers,
            )
            assert res_pi.status_code == 200
            data_pi = res_pi.json()
            assert data_pi["currentQuestion"]["id"] == "previous_investigations"
            regex = DEVANAGARI_REGEX if lang == "hi" else KANNADA_REGEX
            assert regex.search(data_pi["currentQuestion"]["promptLocalized"])

            # Answer previous_investigations with None / not sure in target language
            none_ans = "कोई नहीं / पक्का नहीं" if lang == "hi" else "ಯಾವುದೂ ಇಲ್ಲ / ಖಚಿತವಿಲ್ಲ"
            current_answers = dict(case.intakeAnswers)
            current_answers["previous_investigations"] = none_ans
            put_pi = client.put(
                f"/api/v1/cases/{case.caseId}",
                headers=headers,
                json={"intakeAnswers": current_answers},
            )
            assert put_pi.status_code == 200
            ans_pi = put_pi.json()["intakeAnswers"]["previous_investigations"]
            assert ans_pi["value"] == "None / not sure"

            # Query other_history in correction mode
            res_oh = client.get(
                f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=other_history",
                headers=headers,
            )
            assert res_oh.status_code == 200
            data_oh = res_oh.json()
            assert data_oh["currentQuestion"]["id"] == "other_history"
            assert regex.search(data_oh["currentQuestion"]["promptLocalized"])

            # Answer other_history with Nothing else in target language
            nothing_ans = "कुछ और नहीं" if lang == "hi" else "ಬೇರೇನೂ ಇಲ್ಲ"
            current_answers["other_history"] = nothing_ans
            put_oh = client.put(
                f"/api/v1/cases/{case.caseId}",
                headers=headers,
                json={"intakeAnswers": current_answers},
            )
            assert put_oh.status_code == 200
            ans_oh = put_oh.json()["intakeAnswers"]["other_history"]
            assert ans_oh["value"] == "Nothing else"

            # Query ayush_samprapti in correction mode
            res_samp = client.get(
                f"/api/v1/cases/{case.caseId}/adaptive-intake?mode=correction&question_id=ayush_samprapti",
                headers=headers,
            )
            assert res_samp.status_code == 200
            data_samp = res_samp.json()
            assert data_samp["currentQuestion"]["id"] == "ayush_samprapti"
            assert regex.search(data_samp["currentQuestion"]["promptLocalized"])

        finally:
            from app.models.event import UnifiedClinicalEvent
            test_db.query(UnifiedClinicalEvent).filter_by(caseId=case.caseId).delete()
            test_db.delete(case)
            test_db.commit()
