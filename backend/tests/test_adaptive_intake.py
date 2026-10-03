from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.schemas.intake import IntakeRequestMode, IntakeState
from app.services.adaptive_intake import INTAKE_QUESTIONS, select_intake_state


def _answers_through(question_id: str, allergy_answer: str = "none") -> dict[str, str]:
    answers: dict[str, str] = {}
    for question in INTAKE_QUESTIONS:
        if question.id == "allergies":
            answers[question.id] = allergy_answer
        elif question.id == "allergy_reaction" and allergy_answer == "none":
            continue
        else:
            answers[question.id] = f"answer for {question.id}"
        if question.id == question_id:
            break
    return answers


def test_first_question_selection():
    state = select_intake_state(None)

    assert state.state == IntakeState.QUESTION
    assert state.currentQuestion.id == "chief_complaint"


def test_answered_questions_are_skipped():
    state = select_intake_state({"chief_complaint": "Headache"})

    assert state.currentQuestion.id == "present_illness"
    assert state.answeredQuestionIds == ["chief_complaint"]


def test_conditional_follow_up_becomes_eligible():
    state = select_intake_state(_answers_through("allergies", "Penicillin"))

    assert state.currentQuestion.id == "allergy_reaction"
    assert "allergy_reaction" not in state.irrelevantQuestionIds


def test_irrelevant_follow_up_is_skipped():
    state = select_intake_state(_answers_through("allergies", "none"))

    assert state.currentQuestion.id == "family_history"
    assert "allergy_reaction" in state.irrelevantQuestionIds


def test_clarification_state():
    state = select_intake_state(
        {"chief_complaint": "Headache"},
        mode=IntakeRequestMode.CLARIFICATION,
        question_id="chief_complaint",
    )

    assert state.state == IntakeState.CLARIFICATION
    assert state.currentQuestion.id == "chief_complaint"


def test_correction_state():
    state = select_intake_state(
        {"chief_complaint": "Headache"},
        mode=IntakeRequestMode.CORRECTION,
        question_id="chief_complaint",
    )

    assert state.state == IntakeState.CORRECTION
    assert state.currentQuestion.id == "chief_complaint"


def test_completed_state():
    answers = _answers_through("review_of_systems", "none")

    state = select_intake_state(answers)

    assert state.state == IntakeState.COMPLETE
    assert state.currentQuestion is None
    assert "allergy_reaction" in state.irrelevantQuestionIds


@pytest.mark.parametrize("malformed_answers", [[], "invalid", 42, None])
def test_malformed_answer_container_is_safe(malformed_answers):
    state = select_intake_state(malformed_answers)

    assert state.state == IntakeState.QUESTION
    assert state.currentQuestion.id == "chief_complaint"


def test_malformed_answer_value_requests_clarification():
    state = select_intake_state({"chief_complaint": {"unexpected": "object"}})

    assert state.state == IntakeState.CLARIFICATION
    assert state.currentQuestion.id == "chief_complaint"
    assert state.malformedAnswerQuestionIds == ["chief_complaint"]


@pytest.fixture()
def adaptive_client(tmp_path: Path):
    database_path = tmp_path / "adaptive-intake.db"
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


def _create_case(client: TestClient, patient_id: str) -> tuple[str, str]:
    response = client.post(
        "/api/v1/cases",
        json={"patientId": patient_id, "consentGranted": True},
    )
    assert response.status_code == 201
    payload = response.json()
    return payload["case"]["caseId"], payload["token"]


def test_adaptive_endpoint_is_authenticated_and_returns_state(adaptive_client):
    case_id, token = _create_case(adaptive_client, "adaptive-patient")

    unauthenticated = adaptive_client.get(f"/api/v1/cases/{case_id}/adaptive-intake")
    response = adaptive_client.get(
        f"/api/v1/cases/{case_id}/adaptive-intake",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 200
    assert response.json()["state"] == "question"
    assert response.json()["currentQuestion"]["id"] == "chief_complaint"


def test_adaptive_endpoint_prevents_cross_patient_access(adaptive_client):
    _, first_token = _create_case(adaptive_client, "first-patient")
    second_case_id, _ = _create_case(adaptive_client, "second-patient")

    response = adaptive_client.get(
        f"/api/v1/cases/{second_case_id}/adaptive-intake",
        headers={"Authorization": f"Bearer {first_token}"},
    )

    assert response.status_code == 403
