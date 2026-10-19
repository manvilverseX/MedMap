import pytest
from app.schemas.intake import IntakeState, IntakeRequestMode
from app.services.adaptive_intake import select_intake_state, INTAKE_QUESTIONS
from app.services.interview_engine.ayush_questions import (
    AYUSH_QUESTIONS,
    is_ayush_consultation,
    get_next_ayush_question,
    sync_ayush_answers,
)


def test_ayush_questions_definitions():
    """Verify all 14 AYUSH parameters (10 Dashavidha Pariksha + Agni, Koshtha, Ahara-Vihara, Nidana) are present."""
    assert len(AYUSH_QUESTIONS) == 14
    expected_keys = {
        "ayush_prakriti",
        "ayush_vikriti",
        "ayush_sara",
        "ayush_samhanana",
        "ayush_pramana",
        "ayush_satmya",
        "ayush_sattva",
        "ayush_ahara_shakti",
        "ayush_vyayama_shakti",
        "ayush_vaya",
        "ayush_agni",
        "ayush_koshtha",
        "ayush_ahara_vihara",
        "ayush_nidana",
    }
    actual_keys = {q.id for q in AYUSH_QUESTIONS}
    assert expected_keys == actual_keys

    # Each question must provide patient-friendly options and "Not sure"
    for q in AYUSH_QUESTIONS:
        assert q.options is not None
        assert any("not sure" in opt.lower() for opt in q.options)


def test_personal_history_questions_in_general_intake():
    """Verify personal history questions (diet, sleep, habits, occupation) are in INTAKE_QUESTIONS."""
    q_ids = {q.id for q in INTAKE_QUESTIONS}
    assert "personal_diet" in q_ids
    assert "personal_sleep" in q_ids
    assert "personal_habits" in q_ids
    assert "personal_occupation" in q_ids


def test_general_pathway_completion():
    """Standard clinical intake with personal history resolves to complete without forcing AYUSH."""
    answers = {
        "chief_complaint": "Persistent dull headache for three days",
        "present_illness": "Started 3 days ago, gradual onset, throbbing",
        "hpi_timing": "3 days ago",
        "hpi_character": "Throbbing or pulsing",
        "hpi_severity": "Moderate (4 - 6)",
        "hpi_radiation": "Stays in one localized area",
        "hpi_triggers": "Worse with bright light",
        "hpi_associated": "Mild nausea",
        "medications": "No current medications",
        "allergies": "No known allergies",
        "past_medical": "No prior medical conditions",
        "past_surgical": "No previous surgeries",
        "family_history": "No family history of migraines",
        "review_of_systems": "No other symptoms",
        "personal_diet": "Vegetarian",
        "personal_sleep": "Normal (6-8 hours restful)",
        "personal_habits": "None / Never used",
        "personal_occupation": "Desk / Sedentary work",
    }
    state = select_intake_state(answers, enable_ai=False)
    # Since consultation_type is general, it completes without branching to AYUSH
    assert state.state == IntakeState.COMPLETE


def test_ayush_consultation_detection():
    """Verify is_ayush_consultation correctly detects AYUSH pathway intent."""
    assert is_ayush_consultation({"consultation_type": "ayush"}) is True
    assert is_ayush_consultation({"consultationType": "ayush"}) is True
    assert is_ayush_consultation({"consultation_type": "general"}) is False
    assert is_ayush_consultation({"ayush": {"prakriti": "Slender"}}) is True
    assert is_ayush_consultation({"ayush_prakriti": "Slender"}) is True
    assert is_ayush_consultation({}) is False


def test_ayush_pathway_branching_and_completion():
    """Verify AYUSH pathway asks general history first, then branches into all 14 AYUSH parameters, then completes."""
    base_general_answers = {
        "consultation_type": "ayush",
        "chief_complaint": "Joint stiffness and knee pain in the morning",
        "present_illness": "Started 1 month ago, worse in cold weather",
        "hpi_timing": "More than a month ago",
        "hpi_character": "Dull ache and stiffness",
        "hpi_severity": "Moderate (4 - 6)",
        "hpi_radiation": "Stays in both knees",
        "hpi_triggers": "Better with warmth and gentle movement",
        "hpi_associated": "No other associated symptoms",
        "medications": "No daily prescriptions",
        "allergies": "No known allergies",
        "past_medical": "No chronic conditions",
        "past_surgical": "No previous surgeries",
        "family_history": "Mother had joint pain",
        "review_of_systems": "No other symptoms",
        "personal_diet": "Vegetarian",
        "personal_sleep": "Disturbed by knee discomfort",
        "personal_habits": "None",
        "personal_occupation": "Desk work",
    }

    # With general complete and consultation_type=ayush, state must be QUESTION for the first AYUSH parameter
    state1 = select_intake_state(base_general_answers, enable_ai=False)
    assert state1.state == IntakeState.QUESTION
    assert state1.currentQuestion is not None
    assert state1.currentQuestion.id == "ayush_prakriti"

    # Answer Prakriti
    base_general_answers["ayush_prakriti"] = "Slender/light frame, dry skin, sensitive to cold/wind (Vata-dominant)"
    state2 = select_intake_state(base_general_answers, enable_ai=False)
    assert state2.state == IntakeState.QUESTION
    assert state2.currentQuestion.id == "ayush_vikriti"

    # Fill remaining AYUSH questions
    for q in AYUSH_QUESTIONS:
        if q.id not in base_general_answers:
            base_general_answers[q.id] = q.options[0]

    final_state = select_intake_state(base_general_answers, enable_ai=False)
    assert final_state.state == IntakeState.COMPLETE


def test_sync_ayush_answers_into_nested_key():
    """Verify answers to ayush_* questions are mirrored into answers['ayush'] dict without diagnosing."""
    answers = {
        "consultation_type": "ayush",
        "ayush_prakriti": "Pitta-dominant",
        "ayush_vikriti": "Acidity, burning sensation",
        "ayush_agni": "Tikshna Agni",
    }
    synced = sync_ayush_answers(answers)
    assert "ayush" in synced
    assert synced["ayush"]["prakriti"] == "Pitta-dominant"
    assert synced["ayush"]["vikriti"] == "Acidity, burning sensation"
    assert synced["ayush"]["agni"] == "Tikshna Agni"
    # Ensure no automated Prakriti diagnosis field was injected
    assert "prakriti_diagnosis" not in synced["ayush"]
    assert "diagnosis" not in synced["ayush"]
