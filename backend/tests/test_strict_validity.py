import json
import pytest
from unittest.mock import MagicMock, patch
from groq import APITimeoutError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
import app.models.case  # noqa: F401
import app.models.event  # noqa: F401
import app.models.document  # noqa: F401

from app.services.adaptive_intake import validate_clinical_answer, select_intake_state, INTAKE_QUESTIONS
from app.services import case_service
from app.schemas.case import CaseCreate, CaseUpdate
from app.api.v1.cases import update_case, get_adaptive_intake_state
from app.schemas.intake import IntakeState


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@patch("app.services.translation_service.Groq")
def test_gibberish_rejected_repeatedly_en_kn_hi(mock_groq_cls, db_session):
    """Submitting gibberish 3 times in a row in en, kn, or hi must be rejected on every attempt."""
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps(["aaaa"])
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    mock_groq_cls.return_value = mock_client

    gibberish_samples = [
        ("en", "asdfghjkl"),
        ("kn", "ಅಅಅಅ"),
        ("hi", "अअअअ"),
    ]

    for lang, bad_text in gibberish_samples:
        case = case_service.create_case(
            db_session,
            CaseCreate(patientId=f"p-bad-{lang}", language=lang, consentGranted=True)
        )
        user = {"role": "patient", "case_id": case.caseId}

        # Submit 3 times in a row with the exact same bad text
        for attempt in range(1, 4):
            up = CaseUpdate(intakeAnswers={"chief_complaint": bad_text})
            res = update_case(case.caseId, up, db=db_session, current_user=user)
            ans = res.intakeAnswers["chief_complaint"]

            assert isinstance(ans, dict)
            assert "clarification_needed" in ans, f"Failed on {lang} attempt {attempt}"
            assert ans.get("reason_code") == "ANSWER_INVALID"
            assert ans.get("clarification_attempts") == attempt

            state = get_adaptive_intake_state(case.caseId, db=db_session, current_user=user)
            assert state.state == IntakeState.CLARIFICATION
            assert state.currentQuestion.id == "chief_complaint"


def test_valid_short_answers_accepted():
    """Legitimate direct responses ('no', 'none', 'ಇಲ್ಲ', 'नहीं', 'yes', '3') must be accepted."""
    valid_answers = [
        ("allergies", "no"),
        ("allergies", "none"),
        ("allergies", "ಇಲ್ಲ"),
        ("allergies", "नहीं"),
        ("past_medical", "yes"),
        ("present_illness", "3"),  # Numeric duration
        ("present_illness", "8/10"),  # Severity scale
    ]

    for q_id, ans in valid_answers:
        res = validate_clinical_answer(q_id, ans)
        assert res.needs_clarification is False, f"Expected {ans} for {q_id} to be accepted, got clarification"


@patch("app.services.ai_service.Groq")
def test_off_topic_sentence_rejected_by_groq_relevance(mock_groq_cls, db_session):
    """Off-topic sentence (e.g. about sports/movies) is rejected by Groq relevance with ANSWER_NOT_RELEVANT."""
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps({
        "valid": False,
        "reason_code": "ANSWER_NOT_RELEVANT",
        "clarifying_question": "Your answer does not seem related to this question. Please describe your symptoms."
    })
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    mock_groq_cls.return_value = mock_client

    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-offtopic", language="en", consentGranted=True)
    )
    user = {"role": "patient", "case_id": case.caseId}

    up = CaseUpdate(intakeAnswers={"chief_complaint": "I love watching football on Sundays with pizza"})
    res = update_case(case.caseId, up, db=db_session, current_user=user)
    ans = res.intakeAnswers["chief_complaint"]

    assert isinstance(ans, dict)
    assert "clarification_needed" in ans
    assert ans.get("reason_code") == "ANSWER_NOT_RELEVANT"

    state = get_adaptive_intake_state(case.caseId, db=db_session, current_user=user)
    assert state.state == IntakeState.CLARIFICATION


@patch("app.services.translation_service.Groq")
def test_emergency_text_accepted_and_escalated(mock_groq_cls, db_session):
    """Emergency text (e.g. chest pain in Kannada) must NEVER be blocked by validation; it must be accepted and escalate."""
    # Mock translation of Kannada chest pain to English
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps(["severe crushing chest pain and breathlessness"])
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    mock_groq_cls.return_value = mock_client

    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-emerg", language="kn", consentGranted=True)
    )
    user = {"role": "patient", "case_id": case.caseId}

    up = CaseUpdate(intakeAnswers={"chief_complaint": "ಎದೆ ನೋವು ಉಸಿರಾಟ ತೊಂದರೆ"})
    res = update_case(case.caseId, up, db=db_session, current_user=user)
    ans = res.intakeAnswers["chief_complaint"]

    assert isinstance(ans, dict)
    # Must NOT be blocked by clarification
    assert "clarification_needed" not in ans

    state = get_adaptive_intake_state(case.caseId, db=db_session, current_user=user)
    assert state.state == IntakeState.SAFETY_ESCALATION
    assert state.safetyEscalation is not None
    assert state.safetyEscalation.isEscalated is True


@patch("app.services.ai_service.Groq")
def test_groq_outage_falls_back_to_deterministic_checks(mock_groq_cls, db_session):
    """When Groq times out or errors, fall back to deterministic validation; genuine answer accepted with relevanceUnchecked=True."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = APITimeoutError(request=MagicMock())
    mock_groq_cls.return_value = mock_client

    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-outage", language="en", consentGranted=True)
    )
    user = {"role": "patient", "case_id": case.caseId}

    # Genuine symptoms answer passes deterministic checks
    up = CaseUpdate(intakeAnswers={"chief_complaint": "High fever and persistent cough for 4 days"})
    res = update_case(case.caseId, up, db=db_session, current_user=user)
    ans = res.intakeAnswers["chief_complaint"]

    # In English flow, a valid answer is saved as the string
    assert ans == "High fever and persistent cough for 4 days"

    state = get_adaptive_intake_state(case.caseId, db=db_session, current_user=user)
    assert state.state != IntakeState.CLARIFICATION


@patch("app.services.ai_service.Groq")
def test_english_flow_unchanged(mock_groq_cls, db_session):
    """Standard English clinical flow saves valid answers without regression."""
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps({"valid": True, "reason_code": None, "clarifying_question": None})
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    mock_groq_cls.return_value = mock_client

    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-en-flow", language="en", consentGranted=True)
    )
    user = {"role": "patient", "case_id": case.caseId}

    up = CaseUpdate(intakeAnswers={"chief_complaint": "Severe throbbing migraine on the left temple for 2 days"})
    res = update_case(case.caseId, up, db=db_session, current_user=user)
    ans = res.intakeAnswers["chief_complaint"]

    assert ans == "Severe throbbing migraine on the left temple for 2 days"

    state = get_adaptive_intake_state(case.caseId, db=db_session, current_user=user)
    # Advances to next question (history of present illness)
    assert state.currentQuestion.id == "present_illness"
