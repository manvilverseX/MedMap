import difflib
import re
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from app.schemas.intake import (
    ClinicalProgress,
    IntakeDependency,
    IntakeQuestion,
    IntakeRequestMode,
    IntakeSessionState,
    IntakeState,
    SafetyEscalation,
)
from app.services.interview_engine.clinical_gaps import (
    ClinicalGap,
    identify_unresolved_gaps,
    has_reported_allergy,
)
from app.services.interview_engine.policy_engine import (
    CURATED_GAP_QUESTIONS,
    InterviewPolicyEngine,
)
from app.services.interview_engine.safety_evaluator import (
    SafetyCheckResult,
    evaluate_emergency_safety,
)
from app.services.interview_engine.ayush_questions import (
    AYUSH_QUESTIONS,
    AYUSH_QUESTION_MAP,
    is_ayush_consultation,
    get_ayush_question,
    get_next_ayush_question,
    sync_ayush_answers,
)


INTAKE_QUESTIONS: tuple[IntakeQuestion, ...] = (
    IntakeQuestion(
        id="chief_complaint",
        category="Chief Complaint",
        prompt="What is the main reason for your visit today?",
        helperText="Describe your primary concern in a few words.",
        inputType="text",
        clarificationOptions=(
            "Fever or chills",
            "Cough or respiratory issue",
            "Headache or migraine",
            "Stomach or abdominal pain",
            "Chest discomfort",
            "Body ache or fatigue",
        ),
    ),
    IntakeQuestion(
        id="present_illness",
        category="History of Present Illness",
        prompt="Please describe your current symptoms in detail.",
        helperText="When did it start? How has it changed? What makes it better or worse?",
        inputType="textarea",
        clarificationOptions=(
            "Started today",
            "1 to 3 days ago",
            "About 1 week ago",
            "2 to 4 weeks ago",
            "More than a month ago",
            "I'm not sure",
        ),
    ),
    IntakeQuestion(
        id="past_medical",
        category="Past Medical History",
        prompt="Do you have any previously diagnosed medical conditions?",
        helperText="Include chronic conditions such as high blood pressure, diabetes, or asthma.",
        inputType="textarea",
        options=(
            "No prior medical conditions",
            "High blood pressure (Hypertension)",
            "Diabetes",
            "Asthma / Respiratory condition",
            "Thyroid disorder",
        ),
    ),
    IntakeQuestion(
        id="past_surgical",
        category="Past Surgical History",
        prompt="Have you had any surgeries or procedures in the past?",
        helperText="List procedure names and approximate years if you recall them.",
        inputType="textarea",
        options=(
            "No previous surgeries or procedures",
            "Yes, had surgery in the past",
        ),
    ),
    IntakeQuestion(
        id="medications",
        category="Medication History",
        prompt="What medications are you currently taking?",
        helperText="Include prescriptions, over-the-counter drugs, and herbal supplements.",
        inputType="textarea",
        options=(
            "No current medications",
            "Yes, taking daily medications",
        ),
    ),
    IntakeQuestion(
        id="allergies",
        category="Allergies",
        prompt="Do you have any known allergies?",
        helperText="Mention allergies to medications (e.g. Penicillin), foods, or latex.",
        inputType="textarea",
        options=(
            "No known allergies",
            "Penicillin or antibiotics",
            "Sulfa drugs",
            "Food allergy",
            "Other allergy",
        ),
    ),
    IntakeQuestion(
        id="allergy_reaction",
        category="Allergies",
        prompt="What reaction do you have to the allergy or allergies you listed?",
        helperText="Describe the reaction only if you know it (e.g. hives, swelling, difficulty breathing).",
        inputType="textarea",
        dependency=IntakeDependency(
            questionId="allergies",
            excludedAnswers=(
                "",
                "no",
                "none",
                "no known allergies",
                "no allergies",
                "n/a",
                "na",
                "nil",
                "nothing",
                "denies",
            ),
        ),
        options=(
            "Mild rash or itching",
            "Hives / Urticaria",
            "Swelling (lips, face, throat)",
            "Breathing difficulty",
            "Anaphylaxis",
            "I'm not sure",
        ),
    ),
    IntakeQuestion(
        id="family_history",
        category="Family History",
        prompt="Is there any significant medical history in your immediate family?",
        helperText="Mention conditions like heart disease, diabetes, or cancer in parents or siblings.",
        inputType="textarea",
        options=(
            "No significant family medical history",
            "Heart disease in family",
            "Diabetes in family",
            "Cancer in family",
            "I'm not sure",
        ),
    ),
    IntakeQuestion(
        id="review_of_systems",
        category="Review of Systems",
        prompt="Are you experiencing any other symptoms we haven't discussed?",
        helperText="For example: fatigue, unexplained weight change, dizziness, or sleep issues.",
        inputType="textarea",
        options=(
            "No other symptoms",
            "Fatigue or low energy",
            "Dizziness or lightheadedness",
            "Unexplained weight change",
            "Nausea or appetite loss",
        ),
    ),
    IntakeQuestion(
        id="personal_diet",
        category="Personal History: Diet",
        prompt="What best describes your usual daily diet?",
        helperText="Include whether your diet is vegetarian, non-vegetarian, or vegan.",
        inputType="textarea",
        options=(
            "Vegetarian",
            "Non-vegetarian",
            "Vegan / Plant-based",
            "Mixed / Flexitarian",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="personal_sleep",
        category="Personal History: Sleep",
        prompt="How would you describe your sleep pattern and quality?",
        helperText="Hours of sleep and whether you wake up feeling rested.",
        inputType="textarea",
        options=(
            "Normal (6-8 hours restful sleep)",
            "Disturbed / Frequent waking",
            "Difficulty falling asleep (Insomnia)",
            "Excessive sleepiness / Daytime fatigue",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="personal_habits",
        category="Personal History: Habits",
        prompt="Do you consume tobacco, nicotine products, or alcohol?",
        helperText="This helps your clinician evaluate cardiovascular and metabolic risks.",
        inputType="textarea",
        options=(
            "None / Never used",
            "Occasional alcohol",
            "Regular alcohol",
            "Smoker / Tobacco user",
            "Past user (now quit)",
            "Prefer not to say",
        ),
    ),
    IntakeQuestion(
        id="personal_occupation",
        category="Personal History: Occupation",
        prompt="What is your current occupation or daily routine environment?",
        helperText="Physical demands or environment of your daily routine.",
        inputType="textarea",
        options=(
            "Desk / Sedentary work",
            "Active / Field work",
            "Manual labor / Physical",
            "Student",
            "Homemaker / Caregiver",
            "Retired / Not currently working",
            "Not sure",
        ),
    ),
)


def extract_answer_text(answer_entry: Any) -> str:
    """Extract clean string value from raw answer or structured answer dictionary."""
    if isinstance(answer_entry, str):
        return answer_entry
    if isinstance(answer_entry, Mapping):
        val = answer_entry.get("value")
        if isinstance(val, str):
            return val
        orig = answer_entry.get("originalValue")
        if isinstance(orig, str):
            return orig
    return ""


# Shared allergy helper (imported from interview_engine.clinical_gaps)
# has_reported_allergy(answer_entry: Any) -> bool



def is_uncertain_answer(text: str) -> bool:
    """Detect if the patient indicated genuine uncertainty."""
    cleaned = text.strip().casefold()
    uncertain_markers = (
        "not sure",
        "don't know",
        "dont know",
        "do not know",
        "unknown",
        "uncertain",
        "can't remember",
        "cant remember",
        "cannot recall",
        "no idea",
        "unsure",
    )
    return any(marker in cleaned for marker in uncertain_markers)


class ValidationResult(tuple):
    """Subclass of tuple (needs_clarification, message) with reason_code.
    Fully backwards-compatible with 2-tuple unpacking: `needs_clar, msg = validate_clinical_answer(...)`.
    """
    def __new__(cls, needs_clar: bool, message: Optional[str] = None, reason_code: Optional[str] = None):
        return super().__new__(cls, (needs_clar, message))

    def __init__(self, needs_clar: bool, message: Optional[str] = None, reason_code: Optional[str] = None):
        self.needs_clarification = needs_clar
        self.message = message
        self.reason_code = reason_code


def validate_clinical_answer(
    question_id: str,
    answer_text: str,
    previous_attempts: int = 0,
) -> ValidationResult:
    """Deterministic clinical validator to identify incomplete, invalid, or ambiguous answers.
    Strict answer validity: never accepts invalid answers on resubmission.
    """
    cleaned = answer_text.strip().casefold()
    if not cleaned:
        return ValidationResult(False, None, None)

    # Reject answers that contain no alphanumeric or Indic script characters (e.g. ".", "...", "!?!", emoji only)
    if not re.search(r"[\w\u0900-\u097F\u0C80-\u0CFF]", cleaned):
        return ValidationResult(True, "Please describe your answer using words or numbers so your care team can understand.", "ANSWER_INVALID")

    # Never penalize uncertainty: if patient says they don't know, accept it without clarification
    if is_uncertain_answer(cleaned):
        return ValidationResult(False, None, None)

    from app.services.interview_engine.none_answers import is_none_answer, allows_none

    # Chief complaint requires a specific symptom or reason for visit, cannot be "none"
    if question_id == "chief_complaint" and is_none_answer(cleaned):
        return ValidationResult(True, "Please describe what symptom you are experiencing or the main reason for your visit today.", "ANSWER_INVALID")

    # If the question allows negative/none responses and the answer is recognized in the lexicon:
    if allows_none(question_id) and is_none_answer(cleaned):
        return ValidationResult(False, None, None)

    # Common valid direct responses across English, Kannada, and Hindi
    valid_direct_responses = {
        # English
        "no", "none", "no known allergies", "no allergies", "n/a", "na",
        "nil", "nothing", "never", "denies", "yes", "i do", "i don't",
        "dont know", "not sure", "unknown", "unsure",
        # Kannada
        "ಇಲ್ಲ", "ಗೊತ್ತಿಲ್ಲ", "ಯಾವುದೂ ಇಲ್ಲ", "ಹೌದು", "ತಿಳಿದಿಲ್ಲ", "ಇಲ್ಲವೇ ಇಲ್ಲ",
        # Hindi
        "नहीं", "पता नहीं", "कुछ नहीं", "हाँ", "मालूम नहीं", "ना",
    }
    if cleaned in valid_direct_responses:
        return ValidationResult(False, None, None)

    # URL / link rejection
    if re.search(r"(https?://|www\.|\.com\b|\.org\b|\.net\b|\.in\b)", cleaned):
        return ValidationResult(True, "Please describe your symptoms in words instead of web links.", "ANSWER_INVALID")

    # Deterministic nonsensical / uninterpretable input detection
    has_repeated_chars = bool(re.search(r"(.)\1{3,}", cleaned))
    has_repeated_words = bool(re.search(r"\b(\w{2,})\s+\1\s+\1\b", cleaned))
    has_consonant_cluster = bool(re.search(r"[bcdfghjklmnpqrstvwxyz]{5,}", cleaned))
    has_row_mash = bool(re.search(r"(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwerty|zxcv)", cleaned))
    has_no_vowels = bool(re.search(r"[a-z]", cleaned)) and not bool(re.search(r"[aeiouy]", cleaned)) and len(cleaned) >= 4
    if has_repeated_chars or has_repeated_words or has_consonant_cluster or has_row_mash or has_no_vowels:
        return ValidationResult(True, "Could you please describe your symptoms in clear words so your care team can understand?", "ANSWER_INVALID")

    # Digits-only check: allowed for questions that accept numeric input (duration, severity, age)
    numeric_questions = {"age", "duration", "severity", "pain_scale", "symptom_duration", "blood_pressure", "weight", "present_illness"}
    if re.fullmatch(r"[\d\s\.,/-]+", cleaned):
        if question_id not in numeric_questions:
            return ValidationResult(True, "Please describe your symptoms using words, not just numbers.", "ANSWER_INVALID")

    # Text far too short (single meaningless letter, etc., e.g. "a", "x", "?")
    if len(cleaned) < 2 and question_id not in numeric_questions:
        return ValidationResult(True, "Your answer is too short. Please describe your symptoms in a few words.", "ANSWER_TOO_SHORT")

    # Question-specific ambiguity detection
    if question_id == "chief_complaint":
        vague_single_terms = {"sick", "pain", "problem", "hurt", "bad", "issue", "not well", "unwell", "ill", "checkup"}
        if cleaned in vague_single_terms or (len(cleaned) < 15 and any(w in cleaned.split() for w in vague_single_terms) and len(cleaned.split()) <= 2):
            return ValidationResult(True, "Could you tell us what specific symptom you are experiencing or which part of your body is affected?", "ANSWER_INVALID")

    elif question_id == "present_illness":
        vague_time_terms = {"recently", "sometime", "a while", "today", "few days", "some time", "yesterday"}
        if cleaned in vague_time_terms:
            return ValidationResult(True, "Could you specify approximately how long you have had these symptoms (e.g. hours, days, or weeks)?", "ANSWER_INVALID")

    elif question_id == "allergies":
        if cleaned in {"yes", "i have allergies", "allergies", "allergic"}:
            return ValidationResult(True, "Please specify which medications, foods, or substances you are allergic to (or select 'Not sure').", "ANSWER_INVALID")

    elif question_id == "medications":
        if cleaned in {"yes", "taking pills", "medication", "meds", "tablets"}:
            return ValidationResult(True, "Please list the names of the medications you are currently taking (or indicate if you don't recall).", "ANSWER_INVALID")

    return ValidationResult(False, None, None)


def _normalized_answers(answers: Any) -> Mapping[str, Any]:
    return answers if isinstance(answers, Mapping) else {}


def _is_eligible(question: IntakeQuestion, answers: Mapping[str, Any]) -> bool:
    dependency = question.dependency
    if dependency is None:
        return True

    dependency_answer = answers.get(dependency.questionId)
    answer_text = extract_answer_text(dependency_answer)
    if not answer_text:
        return False

    if dependency.questionId == "allergies":
        return has_reported_allergy(dependency_answer)

    normalized = answer_text.strip().casefold()
    excluded = {answer.casefold() for answer in dependency.excludedAnswers}
    return normalized not in excluded


def sanitize_active_answers(
    answers: Mapping[str, Any],
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
) -> tuple[dict[str, Any], list[str]]:
    """Filter out answers to questions that are no longer eligible based on updated dependencies.
    Preserves all active questions including dynamic, curated HPI, and follow-up inquiries.
    """
    sanitized: dict[str, Any] = {}
    inactivated_ids: list[str] = []

    # First pass: check eligibility of configured questions with dependencies
    for question in questions:
        if question.id in answers:
            if _is_eligible(question, sanitized):
                sanitized[question.id] = answers[question.id]
            else:
                inactivated_ids.append(question.id)

    # Second pass: preserve all other answered questions (dynamic, curated HPI, or follow-ups)
    for q_id, val in answers.items():
        if q_id not in sanitized and q_id not in inactivated_ids:
            sanitized[q_id] = val

    return sanitized, inactivated_ids


def build_structured_intake(
    answers: Mapping[str, Any],
    verified: bool = False,
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
) -> dict[str, Any]:
    """Convert answers into structured medical history records with provenance.
    Supports both static questions and dynamic clinical interview follow-ups.
    """
    sanitized, inactivated = sanitize_active_answers(answers, questions)
    structured: dict[str, Any] = {}
    by_id = {q.id: q for q in questions}

    # Process active sanitized answers
    for q_id, raw_val in sanitized.items():
        val_text = extract_answer_text(raw_val)
        orig_val = raw_val.get("originalValue", val_text) if isinstance(raw_val, dict) else val_text
        is_clarified = raw_val.get("isClarified", False) if isinstance(raw_val, dict) else False
        is_corrected = raw_val.get("isCorrected", False) if isinstance(raw_val, dict) else False
        is_uncertain = is_uncertain_answer(val_text)

        # Lookup prompt and category
        val_prompt = raw_val.get("prompt") if isinstance(raw_val, Mapping) else None
        val_cat = raw_val.get("category") if isinstance(raw_val, Mapping) else None

        if val_prompt:
            prompt = str(val_prompt)
            category = str(val_cat) if val_cat else "Clinical History"
        elif q_id in by_id:
            prompt = by_id[q_id].prompt
            category = by_id[q_id].category
        elif q_id in CURATED_GAP_QUESTIONS:
            prompt = CURATED_GAP_QUESTIONS[q_id]["prompt"]
            category = CURATED_GAP_QUESTIONS[q_id]["category"]
        else:
            # Dynamic question key formatted as dynamic_<gap> or <gap>_followup
            gap_key = q_id.replace("dynamic_", "").replace("_ext", "").replace("_followup", "")
            if gap_key in CURATED_GAP_QUESTIONS:
                prompt = CURATED_GAP_QUESTIONS[gap_key]["prompt"]
                category = CURATED_GAP_QUESTIONS[gap_key]["category"]
            else:
                prompt = q_id.replace("_", " ").title()
                category = "Clinical History"

        structured[q_id] = {
            "questionId": q_id,
            "category": category,
            "prompt": prompt,
            "value": val_text,
            "originalValue": orig_val,
            "isClarified": is_clarified,
            "isCorrected": is_corrected,
            "isUncertain": is_uncertain,
            "active": True,
            "verified": verified,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    # Process inactivated answers (branch audit trail)
    for q_id in inactivated:
        old_val = extract_answer_text(answers.get(q_id))
        prompt = by_id[q_id].prompt if q_id in by_id else q_id.replace("_", " ").title()
        category = by_id[q_id].category if q_id in by_id else "Allergies"

        structured[q_id] = {
            "questionId": q_id,
            "category": category,
            "prompt": prompt,
            "value": old_val,
            "originalValue": old_val,
            "active": False,
            "verified": False,
            "inactivatedReason": "Conditional dependency not met",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    return structured


def select_intake_state(
    answers: Any,
    *,
    mode: Optional[IntakeRequestMode] = None,
    question_id: Optional[str] = None,
    questions: Sequence[IntakeQuestion] = INTAKE_QUESTIONS,
    enable_ai: bool = True,
) -> IntakeSessionState:
    """Derive adaptive intake state using the hybrid clinical interview engine.
    Orchestrates safety checks, structured extraction, gap analysis, AI generation,
    deterministic policy validation, and defensible stopping conditions.
    """
    answer_map = _normalized_answers(answers)
    answer_map = sync_ayush_answers(answer_map)
    by_id = {q.id: q for q in questions}
    # Index AYUSH questions
    for ay_q in AYUSH_QUESTIONS:
        if ay_q.id not in by_id:
            by_id[ay_q.id] = ay_q
    # Also index curated gap questions
    for gap_id, q_data in CURATED_GAP_QUESTIONS.items():
        if q_data["id"] not in by_id:
            by_id[q_data["id"]] = IntakeQuestion(
                id=q_data["id"],
                category=q_data["category"],
                prompt=q_data["prompt"],
                helperText=q_data.get("helperText"),
                inputType=q_data.get("inputType", "textarea"),
                options=q_data.get("options"),
            )

    # 1. Deterministic Emergency Safety Check
    safety_result = evaluate_emergency_safety(answer_map)
    if safety_result.is_escalated:
        escalation_obj = SafetyEscalation(
            isEscalated=True,
            severity=safety_result.severity,
            title=safety_result.title,
            message=safety_result.message,
            instructions=safety_result.instructions,
            redFlags=safety_result.red_flags,
        )
        return IntakeSessionState(
            state=IntakeState.SAFETY_ESCALATION,
            currentQuestion=None,
            answeredQuestionIds=list(answer_map.keys()),
            skippedQuestionIds=[],
            irrelevantQuestionIds=[],
            malformedAnswerQuestionIds=[],
            safetyEscalation=escalation_obj,
            allowUncertainty=True,
        )

    # 2. Track Answered, Skipped, and Malformed Answers
    answered_ids: list[str] = []
    skipped_ids: list[str] = []
    malformed_ids: list[str] = []

    for q_key, raw_val in answer_map.items():
        if q_key in ("ayush", "consultation_type", "consultationType"):
            continue
        if isinstance(raw_val, str):
            answered_ids.append(q_key)
            if not raw_val.strip():
                skipped_ids.append(q_key)
        elif isinstance(raw_val, Mapping):
            if "clarification_needed" in raw_val or "value" not in raw_val or not isinstance(raw_val.get("value"), str):
                malformed_ids.append(q_key)
            else:
                answered_ids.append(q_key)
                val = raw_val.get("value", "")
                if not val.strip():
                    skipped_ids.append(q_key)
        else:
            malformed_ids.append(q_key)

    # Check allergy branch relevance
    has_allergy = has_reported_allergy(answer_map.get("allergies", ""))
    irrelevant_ids = ["allergy_reaction"] if ("allergies" in answer_map and not has_allergy) else []

    # Calculate clinical progress
    resolved_gaps, unresolved_gaps = identify_unresolved_gaps(
        answer_map,
        extract_answer_text(answer_map.get("chief_complaint", "")),
    )
    total_gaps = len(resolved_gaps) + len(unresolved_gaps)
    progress_obj = ClinicalProgress(
        domainsExplored=[g.replace("_", " ").title() for g in resolved_gaps],
        activeDomain=unresolved_gaps[0].replace("_", " ").title() if unresolved_gaps else "Complete",
        questionsAnswered=len(answered_ids),
        coverageStatus="satisfactory" if len(resolved_gaps) >= 4 else "in_progress",
        unresolvedGapsCount=len(unresolved_gaps),
        totalRelevantGaps=total_gaps,
        resolvedGaps=len(resolved_gaps),
    )

    state_kwargs: dict[str, Any] = {
        "answeredQuestionIds": answered_ids,
        "skippedQuestionIds": skipped_ids,
        "irrelevantQuestionIds": irrelevant_ids,
        "malformedAnswerQuestionIds": malformed_ids,
        "clinicalProgress": progress_obj,
        "allowUncertainty": True,
    }

    # Helper to find previous question ID for back navigation
    def find_previous_question_id(target_id: Optional[str]) -> Optional[str]:
        if not target_id or not answered_ids:
            return None
        if target_id in answered_ids:
            idx = answered_ids.index(target_id)
            if idx > 0:
                return answered_ids[idx - 1]
        elif answered_ids:
            return answered_ids[-1]
        return None

    # Handle Correction Mode (e.g. patient navigating back to review/edit)
    if mode == IntakeRequestMode.CORRECTION:
        if not question_id:
            raise ValueError("A question_id is required for correction mode")
        if question_id not in answer_map:
            raise ValueError("Only an answered question can be corrected")

        # Resolve target question
        if question_id in by_id:
            target_question = by_id[question_id]
        else:
            gap_key = question_id.replace("dynamic_", "").replace("_ext", "")
            template = CURATED_GAP_QUESTIONS.get(gap_key, CURATED_GAP_QUESTIONS[ClinicalGap.REVIEW_OF_SYSTEMS])
            target_question = IntakeQuestion(
                id=question_id,
                category=template["category"],
                prompt=template["prompt"],
                helperText=template.get("helperText"),
                inputType=template.get("inputType", "textarea"),
                options=template.get("options"),
            )

        orig_answer = extract_answer_text(answer_map.get(question_id))
        prev_id = find_previous_question_id(question_id)

        return IntakeSessionState(
            state=IntakeState.CORRECTION,
            currentQuestion=target_question,
            originalAnswer=orig_answer,
            previousQuestionId=prev_id,
            currentQuestionIndex=answered_ids.index(question_id) + 1 if question_id in answered_ids else 1,
            **state_kwargs,
        )

    # Handle Clarification Mode or Unresolved Malformed Answers
    if mode == IntakeRequestMode.CLARIFICATION or malformed_ids:
        target_clar_id = question_id if mode == IntakeRequestMode.CLARIFICATION and question_id else (malformed_ids[0] if malformed_ids else None)
        if target_clar_id:
            raw_val = answer_map.get(target_clar_id)
            issue_text = "The saved answer needs clarification"
            reason_code = None
            orig_answer = extract_answer_text(raw_val)
            attempts = 1
            if isinstance(raw_val, Mapping):
                if "clarification_needed" in raw_val:
                    issue_text = str(raw_val["clarification_needed"])
                if "reason_code" in raw_val:
                    reason_code = str(raw_val["reason_code"])
                attempts = int(raw_val.get("clarification_attempts", 1))

            target_q = by_id.get(target_clar_id)
            if not target_q:
                gap_key = target_clar_id.replace("dynamic_", "").replace("_ext", "")
                tpl = CURATED_GAP_QUESTIONS.get(gap_key, CURATED_GAP_QUESTIONS[ClinicalGap.REVIEW_OF_SYSTEMS])
                target_q = IntakeQuestion(
                    id=target_clar_id,
                    category=tpl["category"],
                    prompt=tpl["prompt"],
                    helperText=tpl.get("helperText"),
                    inputType=tpl.get("inputType", "textarea"),
                    options=tpl.get("options"),
                )

            prev_id = find_previous_question_id(target_clar_id)

            return IntakeSessionState(
                state=IntakeState.CLARIFICATION,
                currentQuestion=target_q,
                issue=issue_text,
                reasonCode=reason_code,
                originalAnswer=orig_answer,
                clarificationAttempts=attempts,
                previousQuestionId=prev_id,
                currentQuestionIndex=answered_ids.index(target_clar_id) + 1 if target_clar_id in answered_ids else 1,
                **state_kwargs,
            )

    # 3. Normal Interview Loop Evaluation
    next_state, next_question, next_safety, completion_reason = InterviewPolicyEngine.evaluate_interview_step(
        answers=answer_map,
        enable_ai=enable_ai,
    )

    if next_state == IntakeState.SAFETY_ESCALATION and next_safety:
        escalation_obj = SafetyEscalation(
            isEscalated=True,
            severity=next_safety.severity,
            title=next_safety.title,
            message=next_safety.message,
            instructions=next_safety.instructions,
            redFlags=next_safety.red_flags,
        )
        return IntakeSessionState(
            state=IntakeState.SAFETY_ESCALATION,
            currentQuestion=None,
            safetyEscalation=escalation_obj,
            **state_kwargs,
        )

    if next_state in (IntakeState.COMPLETE, IntakeState.INCOMPLETE):
        if next_state == IntakeState.COMPLETE and is_ayush_consultation(answer_map):
            next_ayush = get_next_ayush_question(answer_map)
            if next_ayush:
                prev_id = answered_ids[-1] if answered_ids else None
                current_idx = len(answered_ids) + 1
                total_est = len(answered_ids) + len(AYUSH_QUESTIONS)
                return IntakeSessionState(
                    state=IntakeState.QUESTION,
                    currentQuestion=next_ayush,
                    previousQuestionId=prev_id,
                    currentQuestionIndex=current_idx,
                    totalEligibleQuestions=total_est,
                    questionMeta={
                        "purpose": next_ayush.category,
                        "gapExplored": "ayush",
                    },
                    **state_kwargs,
                )

        return IntakeSessionState(
            state=next_state,
            currentQuestion=None,
            completionReason=completion_reason,
            previousQuestionId=answered_ids[-1] if answered_ids else None,
            currentQuestionIndex=len(answered_ids),
            totalEligibleQuestions=len(answered_ids),
            **state_kwargs,
        )

    # Next Question
    prev_id = answered_ids[-1] if answered_ids else None
    current_idx = len(answered_ids) + 1
    total_est = len(resolved_gaps) + len(unresolved_gaps)

    return IntakeSessionState(
        state=IntakeState.QUESTION,
        currentQuestion=next_question,
        previousQuestionId=prev_id,
        currentQuestionIndex=current_idx,
        totalEligibleQuestions=total_est,
        questionMeta={
            "purpose": next_question.purpose if next_question else None,
            "gapExplored": next_question.gapExplored if next_question else None,
        },
        **state_kwargs,
    )

