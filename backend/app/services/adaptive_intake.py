from collections.abc import Mapping
from typing import Any, Optional, Sequence

from app.schemas.intake import (
    IntakeDependency,
    IntakeQuestion,
    IntakeRequestMode,
    IntakeSessionState,
    IntakeState,
)


INTAKE_QUESTIONS: tuple[IntakeQuestion, ...] = (
    IntakeQuestion(
        id="chief_complaint",
        category="Chief Complaint",
        prompt="What is the main reason for your visit today?",
        helperText="Describe your primary concern in a few words.",
        inputType="text",
    ),
    IntakeQuestion(
        id="present_illness",
        category="History of Present Illness",
        prompt="Please describe your current symptoms in detail.",
        helperText="When did it start? How has it changed? What makes it better or worse?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="past_medical",
        category="Past Medical History",
        prompt="Do you have any previously diagnosed medical conditions?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="past_surgical",
        category="Past Surgical History",
        prompt="Have you had any surgeries or procedures in the past?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="medications",
        category="Medication History",
        prompt="What medications are you currently taking?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="allergies",
        category="Allergies",
        prompt="Do you have any known allergies?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="allergy_reaction",
        category="Allergies",
        prompt="What reaction do you have to the allergy or allergies you listed?",
        helperText="Describe the reaction only if you know it.",
        inputType="textarea",
        dependency=IntakeDependency(
            questionId="allergies",
            excludedAnswers=("", "no", "none", "no known allergies", "n/a", "na"),
        ),
    ),
    IntakeQuestion(
        id="family_history",
        category="Family History",
        prompt="Is there any significant medical history in your immediate family?",
        inputType="textarea",
    ),
    IntakeQuestion(
        id="review_of_systems",
        category="Review of Systems",
        prompt="Are you experiencing any other symptoms we haven't discussed?",
        inputType="textarea",
    ),
)


def _normalized_answers(answers: Any) -> Mapping[str, Any]:
    return answers if isinstance(answers, Mapping) else {}


def _is_eligible(question: IntakeQuestion, answers: Mapping[str, Any]) -> bool:
    dependency = question.dependency
    if dependency is None:
        return True

    dependency_answer = answers.get(dependency.questionId)
    if not isinstance(dependency_answer, str):
        return False

    normalized = dependency_answer.strip().casefold()
    excluded = {answer.casefold() for answer in dependency.excludedAnswers}
    return normalized not in excluded


def validate_intake_answers(
    answers: Any,
    *,
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
) -> dict[str, str]:
    """Validate intake answers and return a new, normalized answer mapping."""
    if not isinstance(answers, Mapping):
        raise ValueError("Intake answers must be a mapping")

    by_id = {question.id: question for question in questions}

    unknown_ids = [
        question_id
        for question_id in answers
        if question_id not in by_id
    ]
    if unknown_ids:
        raise ValueError(f"Unknown intake question: {unknown_ids[0]}")

    validated: dict[str, str] = {}

    for question_id, answer in answers.items():
        if not isinstance(answer, str):
            raise ValueError(
                f"Intake answer for '{question_id}' must be a string"
            )
        validated[question_id] = answer.strip()

    for question in questions:
        if question.id in validated and not _is_eligible(question, validated):
            validated.pop(question.id)

    return validated


def apply_intake_response(
    answers: Any,
    question_id: str,
    response: Any,
    *,
    mode: Optional[IntakeRequestMode] = None,
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
) -> dict[str, str]:
    """Validate and apply one patient intake response deterministically."""
    validated = validate_intake_answers(answers, questions=questions)
    by_id = {question.id: question for question in questions}
    if question_id not in by_id:
        raise ValueError(f"Unknown intake question: {question_id}")
    if not isinstance(response, str):
        raise ValueError(f"Intake answer for '{question_id}' must be a string")
    if mode == IntakeRequestMode.CORRECTION and question_id not in validated:
        raise ValueError("Only an answered question can be corrected")
    updated = dict(validated)
    updated[question_id] = response.strip()
    return validate_intake_answers(updated, questions=questions)


def select_intake_state(
    answers: Any,
    *,
    mode: Optional[IntakeRequestMode] = None,
    question_id: Optional[str] = None,
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
) -> IntakeSessionState:
    """Derive adaptive intake state without mutating or reformatting source answers."""
    answer_map = _normalized_answers(answers)
    by_id = {question.id: question for question in questions}
    eligible = [question for question in questions if _is_eligible(question, answer_map)]
    eligible_ids = {question.id for question in eligible}

    answered_ids = [
        question.id
        for question in eligible
        if question.id in answer_map and isinstance(answer_map[question.id], str)
    ]
    skipped_ids = [
        question_id
        for question_id in answered_ids
        if not answer_map[question_id].strip()
    ]
    irrelevant_ids = [
        question.id
        for question in questions
        if question.id not in eligible_ids
    ]
    malformed_ids = [
        question.id
        for question in eligible
        if question.id in answer_map and not isinstance(answer_map[question.id], str)
    ]

    state_kwargs = {
        "answeredQuestionIds": answered_ids,
        "skippedQuestionIds": skipped_ids,
        "irrelevantQuestionIds": irrelevant_ids,
        "malformedAnswerQuestionIds": malformed_ids,
    }

    if mode is not None:
        if question_id is None or question_id not in by_id:
            raise ValueError("A known question_id is required for clarification or correction")
        if question_id not in eligible_ids:
            raise ValueError("The requested question is not relevant to the current answers")
        if mode == IntakeRequestMode.CORRECTION and question_id not in answer_map:
            raise ValueError("Only an answered question can be corrected")
        return IntakeSessionState(
            state=IntakeState(mode.value),
            currentQuestion=by_id[question_id],
            **state_kwargs,
        )

    if malformed_ids:
        malformed_id = malformed_ids[0]
        issue_text = "The saved answer is malformed and needs clarification"
        if isinstance(answer_map[malformed_id], dict) and "clarification_needed" in answer_map[malformed_id]:
            issue_text = answer_map[malformed_id]["clarification_needed"]
            
        return IntakeSessionState(
            state=IntakeState.CLARIFICATION,
            currentQuestion=by_id[malformed_id],
            issue=issue_text,
            **state_kwargs,
        )

    for question in eligible:
        if question.id not in answer_map:
            return IntakeSessionState(
                state=IntakeState.QUESTION,
                currentQuestion=question,
                **state_kwargs,
            )

    return IntakeSessionState(state=IntakeState.COMPLETE, **state_kwargs)
