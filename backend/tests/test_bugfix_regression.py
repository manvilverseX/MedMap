"""Regression tests for Bug 1 (invalid answer accepted) and Bug 2 (edit fails).

Bug 1 root cause: validate_clinical_answer did not check for answers that
  contain no alphanumeric characters. "." has trim().length > 0, passes all
  existing checks, and was silently stored as a valid answer.

Bug 2 root cause: the frontend sent ?questionId=... but the FastAPI endpoint
  declares the query parameter as question_id (snake_case), so it was always
  None, triggering ValueError -> HTTP 400 on every Edit click.
"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.schemas.intake import IntakeRequestMode, IntakeState
from app.services.adaptive_intake import validate_clinical_answer, select_intake_state


@pytest.fixture()
def bugfix_client(tmp_path: Path):
    database_path = tmp_path / "bugfix.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def _make_case(client, patient_id):
    res = client.post("/api/v1/cases", json={"patientId": patient_id, "consentGranted": True})
    assert res.status_code == 201
    p = res.json()
    return p["case"]["caseId"], p["token"]


class TestBug1PunctuationOnlyAnswerRejected:

    def test_single_period_rejected(self):
        needs, prompt = validate_clinical_answer("chief_complaint", ".")
        assert needs is True
        assert prompt is not None
        assert "words" in prompt.lower() or "numbers" in prompt.lower()

    def test_ellipsis_rejected(self):
        needs, prompt = validate_clinical_answer("present_illness", "...")
        assert needs is True
        assert prompt is not None

    def test_whitespace_only_hits_empty_guard(self):
        needs, prompt = validate_clinical_answer("chief_complaint", "   ")
        assert needs is False
        assert prompt is None

    @pytest.mark.parametrize("bad", [".", "...", "!?!", "???", "---", "###", "!!", "@@", ",,,,"])
    def test_punctuation_only_rejected(self, bad):
        needs, prompt = validate_clinical_answer("past_medical", bad)
        assert needs is True, f"{bad!r} should be rejected"
        assert prompt is not None

    def test_no_accepted(self):
        needs, _ = validate_clinical_answer("past_medical", "No")
        assert needs is False

    def test_nil_accepted(self):
        needs, _ = validate_clinical_answer("allergies", "Nil")
        assert needs is False

    def test_none_accepted(self):
        needs, _ = validate_clinical_answer("allergies", "None")
        assert needs is False

    def test_na_accepted(self):
        needs, _ = validate_clinical_answer("past_surgical", "N/A")
        assert needs is False

    def test_numeric_accepted(self):
        needs, _ = validate_clinical_answer("present_illness", "3")
        assert needs is False

    def test_text_with_punctuation_accepted(self):
        needs, _ = validate_clinical_answer("medications", "Ibuprofen 400mg, twice daily.")
        assert needs is False

    @pytest.mark.parametrize("opt", ["No known allergies", "Yes, had surgery in the past", "No current medications"])
    def test_option_pills_accepted(self, opt):
        needs, _ = validate_clinical_answer("allergies", opt)
        assert needs is False, f"Option {opt!r} should not be rejected"

    @pytest.mark.parametrize("expr", ["I'm not sure", "Unknown", "Don't know", "Can't remember"])
    def test_uncertainty_accepted(self, expr):
        needs, _ = validate_clinical_answer("past_medical", expr)
        assert needs is False, f"Uncertainty {expr!r} should not be rejected"

    def test_period_rejected_via_api(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "period-api-patient")
        headers = {"Authorization": f"Bearer {token}"}
        res = bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                                json={"intakeAnswers": {"chief_complaint": "."}})
        assert res.status_code == 200
        cc = res.json()["intakeAnswers"].get("chief_complaint")
        assert isinstance(cc, dict), f"Expected clarification dict, got: {cc!r}"
        assert "clarification_needed" in cc

    def test_ellipsis_rejected_via_api(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "ellipsis-api-patient")
        headers = {"Authorization": f"Bearer {token}"}
        res = bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                                json={"intakeAnswers": {"present_illness": "..."}})
        assert res.status_code == 200
        pi = res.json()["intakeAnswers"].get("present_illness")
        assert isinstance(pi, dict)
        assert "clarification_needed" in pi

    def test_longitudinal_path_cannot_bypass_validation(self, bugfix_client):
        """Longitudinal intake submissions via update_case cannot bypass free-text validation."""
        case_id, token = _make_case(bugfix_client, "longitudinal-bypass-patient")
        headers = {"Authorization": f"Bearer {token}"}
        # First save an initial valid answer
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Persistent headache"}})
        # Longitudinal change attempt with punctuation-only answer
        res = bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                                json={"intakeAnswers": {"chief_complaint": "???"}})
        assert res.status_code == 200
        cc = res.json()["intakeAnswers"].get("chief_complaint")
        assert isinstance(cc, dict), "Punctuation in longitudinal update must be flagged"
        assert "clarification_needed" in cc



class TestBug2EditPreviousResponseSucceeds:

    def test_correction_without_question_id_raises(self):
        with pytest.raises(ValueError, match="question_id is required"):
            select_intake_state({"chief_complaint": "Headache"},
                                mode=IntakeRequestMode.CORRECTION, question_id=None)

    def test_correction_with_question_id_returns_correction_state(self):
        state = select_intake_state({"chief_complaint": "Headache"},
                                    mode=IntakeRequestMode.CORRECTION,
                                    question_id="chief_complaint")
        assert state.state == IntakeState.CORRECTION
        assert state.currentQuestion.id == "chief_complaint"
        assert state.originalAnswer == "Headache"

    def test_correction_preserves_original_answer(self):
        state = select_intake_state({"chief_complaint": "Severe migraine"},
                                    mode=IntakeRequestMode.CORRECTION,
                                    question_id="chief_complaint")
        assert state.originalAnswer == "Severe migraine"

    def test_endpoint_accepts_snake_case_param(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "edit-snake-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Severe migraine"}})
        res = bugfix_client.get(
            f"/api/v1/cases/{case_id}/adaptive-intake?mode=correction&question_id=chief_complaint",
            headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["state"] == "correction"
        assert data["currentQuestion"]["id"] == "chief_complaint"
        assert data["originalAnswer"] == "Severe migraine"

    def test_endpoint_rejects_camelcase_param(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "edit-camel-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Fever"}})
        res = bugfix_client.get(
            f"/api/v1/cases/{case_id}/adaptive-intake?mode=correction&questionId=chief_complaint",
            headers=headers)
        assert res.status_code == 400

    def test_edited_answer_is_persisted(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "persist-edit-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Dull headache"}})
        res = bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                                json={"intakeAnswers": {"chief_complaint": "Severe throbbing headache"}})
        assert res.status_code == 200
        assert res.json()["intakeAnswers"]["chief_complaint"] == "Severe throbbing headache"

    def test_questionnaire_state_consistent_after_edit(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "state-edit-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Dull headache"}})
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Severe throbbing headache"}})
        state = bugfix_client.get(f"/api/v1/cases/{case_id}/adaptive-intake", headers=headers).json()
        assert state["currentQuestion"]["id"] != "chief_complaint"
        assert "chief_complaint" in state["answeredQuestionIds"]

    def test_editing_does_not_duplicate_answered_ids(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "dedup-edit-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Headache"}})
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Migraine with aura"}})
        state = bugfix_client.get(f"/api/v1/cases/{case_id}/adaptive-intake", headers=headers).json()
        answered = state["answeredQuestionIds"]
        count = answered.count("chief_complaint")
        assert count == 1, f"chief_complaint appeared {count} times"

    def test_corrected_answer_revalidated_if_meaningless(self, bugfix_client):
        case_id, token = _make_case(bugfix_client, "reval-edit-patient")
        headers = {"Authorization": f"Bearer {token}"}
        bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                          json={"intakeAnswers": {"chief_complaint": "Headache"}})
        res = bugfix_client.put(f"/api/v1/cases/{case_id}", headers=headers,
                                json={"intakeAnswers": {"chief_complaint": "."}})
        assert res.status_code == 200
        cc = res.json()["intakeAnswers"].get("chief_complaint")
        assert isinstance(cc, dict)
        assert "clarification_needed" in cc
