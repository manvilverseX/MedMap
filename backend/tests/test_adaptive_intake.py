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
    answers = _answers_through("other_history", "none")

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


def test_branching_allergy_yes_to_no_invalidates_dependent_answer():
    from app.services.adaptive_intake import sanitize_active_answers
    # Initially: Penicillin -> allergy_reaction: Hives
    initial = {"allergies": "Penicillin", "allergy_reaction": "Hives"}
    sanitized, inactivated = sanitize_active_answers(initial)
    assert "allergy_reaction" in sanitized
    assert inactivated == []

    # When allergy changes to "No":
    updated = {"allergies": "No known allergies", "allergy_reaction": "Hives"}
    sanitized, inactivated = sanitize_active_answers(updated)
    assert "allergy_reaction" not in sanitized
    assert "allergy_reaction" in inactivated
    assert sanitized == {"allergies": "No known allergies"}


def test_previous_question_id_for_back_navigation():
    # chief_complaint answered -> on present_illness, previousQuestionId should be chief_complaint
    state = select_intake_state({"chief_complaint": "Severe migraine"})
    assert state.currentQuestion.id == "present_illness"
    assert state.previousQuestionId == "chief_complaint"
    assert state.currentQuestionIndex == 2


def test_deterministic_clarification_for_vague_answers():
    from app.services.adaptive_intake import validate_clinical_answer
    # Vague complaint
    needs_clar, prompt = validate_clinical_answer("chief_complaint", "sick")
    assert needs_clar is True
    assert "specific symptom" in prompt

    # Specific complaint passes without clarification
    needs_clar, prompt = validate_clinical_answer("chief_complaint", "Severe throbbing headache on right side")
    assert needs_clar is False

    # Vague timeline for present illness
    needs_clar, prompt = validate_clinical_answer("present_illness", "recently")
    assert needs_clar is True
    assert "how long" in prompt

    # Specific timeline passes
    needs_clar, prompt = validate_clinical_answer("present_illness", "Started 3 days ago after dinner")
    assert needs_clar is False


def test_uncertainty_is_respected_without_clarification_loop():
    from app.services.adaptive_intake import validate_clinical_answer
    # Patient expressing uncertainty should not be forced into clarification
    needs_clar, _ = validate_clinical_answer("allergies", "I don't know")
    assert needs_clar is False

    needs_clar, _ = validate_clinical_answer("present_illness", "Not sure")
    assert needs_clar is False

    needs_clar, _ = validate_clinical_answer("past_surgical", "Can't remember")
    assert needs_clar is False


def test_clarification_attempts_prevent_endless_loops():
    """Updated for Issue B fix: Invalid/vague text must NEVER be accepted on resubmission.
    Submitting the same invalid text repeatedly must continue to be rejected.
    """
    from app.services.adaptive_intake import validate_clinical_answer
    # First attempt with vague answer triggers clarification
    needs_clar, _ = validate_clinical_answer("chief_complaint", "pain", previous_attempts=0)
    assert needs_clar is True

    # Resubmission of the same invalid answer must STILL be rejected (no pass-through)
    needs_clar, _ = validate_clinical_answer("chief_complaint", "pain", previous_attempts=1)
    assert needs_clar is True

    needs_clar, _ = validate_clinical_answer("chief_complaint", "pain", previous_attempts=2)
    assert needs_clar is True


def test_structured_intake_provenance():
    from app.services.adaptive_intake import build_structured_intake
    answers = {
        "chief_complaint": "Persistent cough",
        "allergies": "No known allergies",
    }
    structured = build_structured_intake(answers, verified=False)
    assert "chief_complaint" in structured
    assert structured["chief_complaint"]["value"] == "Persistent cough"
    assert structured["chief_complaint"]["verified"] is False
    assert structured["chief_complaint"]["active"] is True
    assert "allergy_reaction" not in structured or structured["allergy_reaction"]["active"] is False


def test_end_to_end_intake_update_and_reverification_flow(adaptive_client):
    case_id, token = _create_case(adaptive_client, "e2e-patient")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Submit chief complaint
    res = adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"intakeAnswers": {"chief_complaint": "Sharp back pain"}},
    )
    assert res.status_code == 200
    case_data = res.json()
    assert "structuredIntake" in case_data["derivedClinicalData"]
    assert case_data["derivedClinicalData"]["structuredIntake"]["chief_complaint"]["value"] == "Sharp back pain"

    # 2. Submit vague answer -> triggers clarification in intakeAnswers
    res = adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"intakeAnswers": {"chief_complaint": "Sharp back pain", "present_illness": "recently"}},
    )
    assert res.status_code == 200
    res_data = res.json()
    assert "clarification_needed" in res_data["intakeAnswers"]["present_illness"]

    # 3. Clarify answer -> accepts without clarification
    res = adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"intakeAnswers": {"chief_complaint": "Sharp back pain", "present_illness": "Started 2 days ago"}},
    )
    assert res.status_code == 200
    res_data = res.json()
    pi = res_data["intakeAnswers"]["present_illness"]
    assert pi == "Started 2 days ago" or (isinstance(pi, dict) and pi.get("value") == "Started 2 days ago")

    # 4. Patient confirms verification -> status transitions to doctor_review and records verification
    adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"status": "patient_verifying"},
    )
    res_verify = adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"status": "doctor_review"},
    )
    assert res_verify.status_code == 200
    verified_case = res_verify.json()
    assert verified_case["derivedClinicalData"]["patientVerification"]["verified"] is True
    assert verified_case["status"] == "doctor_review"

    # 5. Editing an answer after verification resets verification state
    res_edit = adaptive_client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"status": "patient_verifying", "intakeAnswers": {"chief_complaint": "Dull lower back pain", "present_illness": "Started 2 days ago"}},
    )
    assert res_edit.status_code == 200
    assert res_edit.json()["derivedClinicalData"]["patientVerification"]["verified"] is False


def test_different_complaints_receive_materially_different_follow_ups():
    """Verify that two patients with different initial complaints receive materially different relevant follow-up questions."""
    from app.services.interview_engine.clinical_gaps import (
        ClinicalGap,
        classify_chief_complaint,
        identify_unresolved_gaps,
    )

    # Patient A: High fever with chills
    syndrome_a = classify_chief_complaint("I have had a high fever of 103F with shaking chills for two days")
    assert syndrome_a == "fever"
    _, unresolved_a = identify_unresolved_gaps({}, "I have had a high fever of 103F with shaking chills for two days")

    # Patient B: Abdominal pain
    syndrome_b = classify_chief_complaint("Severe cramping lower abdominal pain with nausea")
    assert syndrome_b == "gastrointestinal"
    _, unresolved_b = identify_unresolved_gaps({}, "Severe cramping lower abdominal pain with nausea")

    # Gaps for abdominal include HPI_CHARACTER and HPI_TRIGGERS, which are not in fever gaps
    assert ClinicalGap.HPI_CHARACTER in unresolved_b
    assert ClinicalGap.HPI_CHARACTER not in unresolved_a
    assert unresolved_a != unresolved_b


def test_multiple_layers_of_follow_up_questions_for_unexplored_gaps():
    """Verify a patient can receive multiple layers of follow-up questions when useful information remains missing."""
    # Patient reports abdominal pain
    answers = {"chief_complaint": "Severe abdominal pain"}
    state_layer1 = select_intake_state(answers)
    assert state_layer1.state == IntakeState.QUESTION
    q1_id = state_layer1.currentQuestion.id

    # Patient answers initial HPI, but critical details (e.g. character / triggers) remain unexplored
    answers[q1_id] = "It hurts a lot on the right side"
    state_layer2 = select_intake_state(answers)
    assert state_layer2.state == IntakeState.QUESTION
    assert state_layer2.currentQuestion is not None
    assert state_layer2.currentQuestion.id != "chief_complaint"


def test_interview_does_not_stop_because_short_list_exhausted():
    """Verify the interview does not stop merely because 2 or 3 questions have been answered."""
    answers = {
        "chief_complaint": "Persistent headache",
        "present_illness": "Started 3 days ago, throbbing on forehead",
    }
    state = select_intake_state(answers)
    # Background, medications, allergies, and review of systems still unexplored
    assert state.state != IntakeState.COMPLETE
    assert state.currentQuestion is not None


def test_interview_stops_when_deterministic_completion_conditions_satisfied():
    """Verify the interview stops when all clinical stages and required information gaps are satisfied."""
    comprehensive_answers = {
        "chief_complaint": "Moderate tension headache",
        "present_illness": "Started 2 days ago, steady dull ache, no visual aura, improves with rest",
        "past_medical": "No chronic medical conditions, no previous hospitalizations",
        "past_surgical": "No prior surgeries",
        "medications": "Occasional ibuprofen 200mg as needed",
        "allergies": "No known allergies to medications or food",
        "family_history": "Mother had occasional migraines, father has hypertension",
        "review_of_systems": "No chest pain, no shortness of breath, no numbness or weakness",
        "previous_investigations": "No prior tests or scans done",
        "other_history": "No other health concerns",
    }
    state = select_intake_state(comprehensive_answers)
    assert state.state == IntakeState.COMPLETE
    assert state.currentQuestion is None


def test_emergency_question_ceiling_prevents_runaway_and_marks_incomplete():
    """Verify the 20-question safeguard ceiling triggers INCOMPLETE state instead of false completion."""
    simulated_answers = {"chief_complaint": "Persistent fatigue and headache"}
    for i in range(1, 21):
        simulated_answers[f"dynamic_question_{i}"] = f"Clinical answer details {i}"

    state = select_intake_state(simulated_answers)
    assert state.state == IntakeState.INCOMPLETE
    assert state.currentQuestion is None


def test_duplicate_and_irrelevant_ai_questions_are_rejected():
    """Verify the policy engine rejects duplicate, diagnostic, or treatment advice questions proposed by AI."""
    from app.services.interview_engine.policy_engine import InterviewPolicyEngine

    # 1. Duplicate question already asked
    is_valid, reason = InterviewPolicyEngine.validate_proposed_question(
        proposed_text="What is your main symptom today?",
        answers={"chief_complaint": "Headache"},
        previously_asked_prompts=["What is your main symptom today?"],
    )
    assert is_valid is False
    assert reason == "duplicate_question"

    # 2. AI attempting to diagnose the patient
    is_valid, reason = InterviewPolicyEngine.validate_proposed_question(
        proposed_text="You have acute appendicitis, would you agree?",
        answers={"chief_complaint": "Abdominal pain"},
        previously_asked_prompts=[],
    )
    assert is_valid is False
    assert reason == "unauthorized_diagnosis"

    # 3. AI attempting to prescribe treatment
    is_valid, reason = InterviewPolicyEngine.validate_proposed_question(
        proposed_text="Should I prescribe you 500mg of amoxicillin?",
        answers={"chief_complaint": "Infection"},
        previously_asked_prompts=[],
    )
    assert is_valid is False
    assert reason == "treatment_advice"


def test_safety_escalation_takes_precedence_over_ordinary_questioning():
    """Verify deterministic safety escalation triggers immediately on cardiac/stroke emergency signs."""
    # Cardiac emergency signs
    state = select_intake_state({
        "chief_complaint": "Severe crushing chest pain radiating to left arm and jaw with profuse cold sweats and shortness of breath"
    })
    assert state.state == IntakeState.SAFETY_ESCALATION
    assert state.safetyEscalation is not None
    assert state.safetyEscalation.isEscalated is True
    assert state.safetyEscalation.severity == "EMERGENCY"
    assert len(state.safetyEscalation.redFlags) > 0

    # Stroke signs (FAST)
    stroke_state = select_intake_state({
        "chief_complaint": "Sudden facial droop and right arm weakness with slurred speech"
    })
    assert stroke_state.state == IntakeState.SAFETY_ESCALATION
    assert stroke_state.safetyEscalation.isEscalated is True
    assert any("stroke" in f.lower() or "droop" in f.lower() or "speech" in f.lower() for f in stroke_state.safetyEscalation.redFlags)


def test_ai_fallback_on_exception():
    """Verify that when AI question planning fails or times out, the engine gracefully falls back to deterministic curated questions."""
    from unittest.mock import patch

    with patch("app.services.interview_engine.policy_engine.generate_ai_question_plan", side_effect=RuntimeError("AI API Timeout")):
        state = select_intake_state({"chief_complaint": "Fever for 2 days"})
        assert state.state == IntakeState.QUESTION
        assert state.currentQuestion is not None
        assert len(state.currentQuestion.prompt) > 0


def test_unknown_or_unavailable_information_extracted_without_fabrication():
    """Verify that patients expressing uncertainty or lack of knowledge have facts recorded as unknown rather than fabricated."""
    from app.services.interview_engine.clinical_gaps import ClinicalGap, extract_clinical_facts

    answers = {
        "chief_complaint": "Headache",
        "past_medical": "I am not sure / Don't know",
        "family_history": "Unknown, I was adopted",
    }
    facts = extract_clinical_facts(answers)
    assert facts[ClinicalGap.PAST_MEDICAL]["isUncertain"] is True
    assert facts[ClinicalGap.FAMILY_HISTORY]["isUncertain"] is True
    assert facts[ClinicalGap.CHIEF_COMPLAINT]["isUncertain"] is False
    assert facts[ClinicalGap.CHIEF_COMPLAINT]["resolved"] is True


def test_nonsensical_answer_is_rejected_for_clarification():
    """Verify nonsensical or uninterpretable answers are flagged for clarification and not stored as valid clinical facts."""
    from app.services.adaptive_intake import validate_clinical_answer

    needs_clar, prompt = validate_clinical_answer("chief_complaint", "asdfghjkl")
    assert needs_clar is True
    assert prompt is not None
    assert "clear words" in prompt.lower() or "symptom" in prompt.lower()


def test_fever_severity_answered_not_asked_again():
    """Verify that after answering fever severity, the engine moves to the next gap instead of re-asking severity."""
    answers = {
        "chief_complaint": "Fever or chills",
        "hpi_timing": "Started 2 days ago, intermittent spikes in evening",
        "hpi_severity": "Moderate (101.5 F), feeling hot and weak",
    }
    # Run state selection with AI disabled for deterministic gap verification
    state = select_intake_state(answers, enable_ai=False)
    assert state.state == IntakeState.QUESTION
    assert state.currentQuestion is not None
    # Must NOT ask severity again
    assert state.currentQuestion.id != "hpi_severity"
    assert "severe" not in state.currentQuestion.prompt.lower() or "how severe" not in state.currentQuestion.prompt.lower()
    # Should move forward to next unresolved gap (associated symptoms)
    assert state.currentQuestion.id == "hpi_associated"


def test_semantic_duplicate_severity_questions_rejected():
    """Verify that paraphrased questions collecting the same severity information are rejected as redundant."""
    from app.services.interview_engine.policy_engine import InterviewPolicyEngine

    q1_asked = "Can you tell me how severe your fever or chills have been, for example on a scale of mild, moderate, or severe?"
    q2_paraphrase = "How would you describe the severity of your fever or chills (e.g., mild, moderate, severe)?"
    q3_paraphrase = "On a scale of 1 to 10, how would you rate the severity of your fever or chills?"

    answers = {
        "chief_complaint": "Fever or chills",
        "hpi_timing": "Started 2 days ago",
        "hpi_severity": "Moderate (101 F)",
    }

    # If Q1 was asked previously or severity was already answered, Q2 and Q3 must be rejected
    is_valid_q2, reason_q2 = InterviewPolicyEngine.validate_proposed_question(
        proposed_text=q2_paraphrase,
        answers=answers,
        previously_asked_prompts=[q1_asked],
    )
    assert is_valid_q2 is False
    assert reason_q2.startswith("semantic_duplicate") or reason_q2 in ("duplicate_question", "redundant_information_already_collected")

    is_valid_q3, reason_q3 = InterviewPolicyEngine.validate_proposed_question(
        proposed_text=q3_paraphrase,
        answers=answers,
        previously_asked_prompts=[q1_asked],
    )
    assert is_valid_q3 is False
    assert reason_q3.startswith("semantic_duplicate") or reason_q3 in ("duplicate_question", "redundant_information_already_collected")


def test_genuinely_different_followup_on_same_symptom_permitted():
    """Verify that follow-up questions exploring a different clinical dimension of the same symptom remain permitted."""
    from app.services.interview_engine.policy_engine import InterviewPolicyEngine

    answers = {
        "chief_complaint": "Fever or chills",
        "hpi_timing": "Started yesterday",
        "hpi_severity": "Moderate fever",
    }
    previously_asked = [
        "When did your fever or chills start, and has it been constant or coming and going?",
        "Can you tell me how severe your fever or chills have been, for example on a scale of mild, moderate, or severe?",
    ]

    # Different clinical dimension 1: Associated symptoms
    q_associated = "Are you experiencing any other symptoms along with the fever, such as body aches, cough, headache, or stiff neck?"
    is_valid_assoc, reason_assoc = InterviewPolicyEngine.validate_proposed_question(
        proposed_text=q_associated,
        answers=answers,
        previously_asked_prompts=previously_asked,
    )
    assert is_valid_assoc is True, f"Associated symptoms should be valid, got rejected with {reason_assoc}"

    # Different clinical dimension 2: Medication response / triggers
    q_triggers = "Have you taken paracetamol or any other fever medications, and did the fever come down?"
    is_valid_trig, reason_trig = InterviewPolicyEngine.validate_proposed_question(
        proposed_text=q_triggers,
        answers=answers,
        previously_asked_prompts=previously_asked,
    )
    assert is_valid_trig is True, f"Medication trigger follow-up should be valid, got rejected with {reason_trig}"


def test_previously_collected_answers_preserved_across_intake_sanitization():
    """Verify that answers to adaptive HPI questions are not stripped out during intake sanitization."""
    from app.services.adaptive_intake import build_structured_intake, sanitize_active_answers

    answers = {
        "chief_complaint": "Fever or chills",
        "hpi_timing": "Started 3 days ago",
        "hpi_severity": "Moderate (101 F)",
        "allergies": "No known allergies",
        "allergy_reaction": "Should be pruned because allergies is none",
    }

    sanitized, inactivated = sanitize_active_answers(answers)
    # hpi_timing and hpi_severity MUST be preserved
    assert "hpi_timing" in sanitized
    assert sanitized["hpi_timing"] == "Started 3 days ago"
    assert "hpi_severity" in sanitized
    assert sanitized["hpi_severity"] == "Moderate (101 F)"
    # Dependent answer whose prerequisite is unmet should still be pruned
    assert "allergy_reaction" not in sanitized
    assert "allergy_reaction" in inactivated

    structured = build_structured_intake(answers)
    assert "hpi_severity" in structured
    assert structured["hpi_severity"]["active"] is True
    assert structured["hpi_severity"]["value"] == "Moderate (101 F)"
    assert structured["hpi_severity"]["category"] in ("Symptom Severity", "History of Present Illness")


def test_cross_answer_narrative_resolves_gap_without_redundant_question():
    """Verify that if the patient's narrative already states severity, the gap is marked resolved."""
    from app.services.interview_engine.clinical_gaps import ClinicalGap, identify_unresolved_gaps

    narrative = "I have had a high fever of 103 degrees Fahrenheit with shaking chills since yesterday"
    resolved, unresolved = identify_unresolved_gaps({"chief_complaint": narrative}, narrative)

    assert ClinicalGap.HPI_SEVERITY in resolved
    assert ClinicalGap.HPI_SEVERITY not in unresolved


def test_safety_escalation_remains_active_during_fever_workflow():
    """Verify safety escalation is not weakened by duplicate prevention and catches red flags."""
    state = select_intake_state({
        "chief_complaint": "High fever of 102F and sudden crushing chest pain radiating to my left arm",
    })
    assert state.state == IntakeState.SAFETY_ESCALATION
    assert state.safetyEscalation is not None
    assert state.safetyEscalation.isEscalated is True
    assert state.safetyEscalation.severity == "EMERGENCY"
    assert any("cardiac" in flag.lower() or "chest pain" in flag.lower() for flag in state.safetyEscalation.redFlags)


def test_conservative_allergy_negation_safety_cases():
    """Safety-critical verification of has_reported_allergy with positive markers and negations."""
    from app.services.interview_engine.clinical_gaps import has_reported_allergy

    assert has_reported_allergy("No known allergies") is False
    assert has_reported_allergy("None") is False
    assert has_reported_allergy("Nil") is False
    assert has_reported_allergy("No known allergies to medications or food") is False
    assert has_reported_allergy("Penicillin") is True
    assert has_reported_allergy("No known allergies to medications, but allergic to peanuts") is True
    assert has_reported_allergy("I am not allergic to anything except dust") is True
    assert has_reported_allergy("Nuts, no other allergies") is True
    assert has_reported_allergy("") is False




