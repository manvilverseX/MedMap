import difflib
import re
from typing import Any, Mapping, Optional
from app.schemas.intake import IntakeDependency, IntakeQuestion, IntakeState
from app.services.interview_engine.ai_planner import AIQuestionPlan, generate_ai_question_plan
from app.services.interview_engine.clinical_gaps import (
    ClinicalGap,
    QUESTION_ID_TO_GAP,
    classify_chief_complaint,
    determine_required_gaps,
    extract_answer_text,
    extract_clinical_facts,
    identify_unresolved_gaps,
    is_uncertain_answer,
)
from app.services.interview_engine.safety_evaluator import SafetyCheckResult, evaluate_emergency_safety


# Pre-approved deterministic question bank for clinical gaps
CURATED_GAP_QUESTIONS: dict[str, dict[str, Any]] = {
    ClinicalGap.CHIEF_COMPLAINT: {
        "id": "chief_complaint",
        "category": "Chief Complaint",
        "prompt": "What is the main reason for your visit today?",
        "helperText": "Describe your primary concern or symptoms in a few words.",
        "inputType": "text",
        "options": (
            "Fever or chills",
            "Cough or respiratory issue",
            "Headache or migraine",
            "Stomach or abdominal pain",
            "Chest discomfort",
            "Body ache or fatigue",
        ),
    },
    ClinicalGap.HPI_TIMING: {
        "id": "present_illness",
        "category": "History of Present Illness",
        "prompt": "Please describe your current symptoms in detail, including when they began and how they have changed.",
        "helperText": "When did it start? How has it changed? What makes it better or worse?",
        "inputType": "textarea",
        "options": (
            "Started today",
            "1 to 3 days ago",
            "About 1 week ago",
            "2 to 4 weeks ago",
            "More than a month ago",
            "I'm not sure",
        ),
    },
    ClinicalGap.HPI_CHARACTER: {
        "id": "hpi_character",
        "category": "Symptom Details",
        "prompt": "How would you describe the feeling or sensation of your symptoms?",
        "helperText": "For example: sharp, dull, throbbing, burning, crampy, tight, or aching.",
        "inputType": "textarea",
        "options": (
            "Sharp or stabbing",
            "Dull ache",
            "Throbbing or pulsing",
            "Burning sensation",
            "Cramping or colicky",
            "Pressure or tightness",
        ),
    },
    ClinicalGap.HPI_SEVERITY: {
        "id": "hpi_severity",
        "category": "Symptom Severity",
        "prompt": "On a scale of 1 to 10 (or mild, moderate, severe), how intense is this discomfort?",
        "helperText": "Does it interfere with your work, sleep, or routine daily activities?",
        "inputType": "textarea",
        "options": (
            "Mild (1 - 3) — noticeable but manageable",
            "Moderate (4 - 6) — interferes with daily tasks",
            "Severe (7 - 9) — unable to perform normal tasks",
            "Worst imaginable (10)",
        ),
    },
    ClinicalGap.HPI_RADIATION: {
        "id": "hpi_radiation",
        "category": "Location & Spread",
        "prompt": "Where exactly is the symptom located, and does it spread or travel anywhere else?",
        "helperText": "Mention if the pain stays in one spot or radiates to another area.",
        "inputType": "textarea",
        "options": (
            "Stays in one localized area",
            "Spreads to my back",
            "Spreads to my shoulder or arm",
            "Spreads across my abdomen",
            "General / all over",
        ),
    },
    ClinicalGap.HPI_TRIGGERS: {
        "id": "hpi_triggers",
        "category": "Triggers & Relief",
        "prompt": "What makes your symptoms feel better or worse?",
        "helperText": "For example: eating, physical movement, resting, deep breathing, or over-the-counter medicine.",
        "inputType": "textarea",
        "options": (
            "Better with rest",
            "Worse with movement or walking",
            "Related to eating or food",
            "Better after pain medication",
            "Nothing seems to change it",
            "I'm not sure",
        ),
    },
    ClinicalGap.HPI_ASSOCIATED: {
        "id": "hpi_associated",
        "category": "Associated Symptoms",
        "prompt": "Have you noticed any other symptoms alongside this main issue?",
        "helperText": "For example: fever, chills, nausea, vomiting, dizziness, shortness of breath, or fatigue.",
        "inputType": "textarea",
        "options": (
            "No other associated symptoms",
            "Nausea or loss of appetite",
            "Fever or chills",
            "Mild shortness of breath",
            "Dizziness or lightheadedness",
        ),
    },
    ClinicalGap.MEDICATIONS: {
        "id": "medications",
        "category": "Medication History",
        "prompt": "What medications, prescriptions, or supplements are you currently taking?",
        "helperText": "Include daily prescriptions, over-the-counter medicines, vitamins, or inhalers.",
        "inputType": "textarea",
        "options": (
            "No current medications",
            "Yes, taking daily medications",
            "Only occasional over-the-counter medicine",
            "I'm not sure of the exact names",
        ),
    },
    ClinicalGap.ALLERGIES: {
        "id": "allergies",
        "category": "Allergies",
        "prompt": "Do you have any allergies to medications, foods, or other substances?",
        "helperText": "Mention allergies to penicillin, sulfa drugs, latex, or specific foods.",
        "inputType": "textarea",
        "options": (
            "No known allergies",
            "Penicillin or antibiotics",
            "Sulfa drugs",
            "Aspirin / NSAIDs",
            "Food allergy",
            "Other allergy",
        ),
    },
    ClinicalGap.ALLERGY_REACTION: {
        "id": "allergy_reaction",
        "category": "Allergies",
        "prompt": "What reaction occurs when you are exposed to the allergy or allergies you listed?",
        "helperText": "Describe symptoms like mild rash, hives, swelling, or breathing difficulty.",
        "inputType": "textarea",
        "options": (
            "Mild skin rash or itching",
            "Hives / Urticaria",
            "Swelling (lips, tongue, throat)",
            "Breathing difficulty",
            "Stomach upset / vomiting",
            "I'm not sure",
        ),
    },
    ClinicalGap.PAST_MEDICAL: {
        "id": "past_medical",
        "category": "Past Medical History",
        "prompt": "Have you been diagnosed with any ongoing or chronic medical conditions?",
        "helperText": "For example: high blood pressure, diabetes, asthma, thyroid disorder, or heart disease.",
        "inputType": "textarea",
        "options": (
            "No prior medical conditions",
            "High blood pressure (Hypertension)",
            "Diabetes",
            "Asthma / Respiratory condition",
            "Thyroid disorder",
            "Heart disease",
        ),
    },
    ClinicalGap.PAST_SURGICAL: {
        "id": "past_surgical",
        "category": "Past Surgical History",
        "prompt": "Have you had any major surgeries, operations, or hospitalizations in the past?",
        "helperText": "List procedure names and approximate years if you recall them.",
        "inputType": "textarea",
        "options": (
            "No previous surgeries or hospitalizations",
            "Yes, had surgery in the past",
            "I'm not sure",
        ),
    },
    ClinicalGap.FAMILY_HISTORY: {
        "id": "family_history",
        "category": "Family History",
        "prompt": "Is there any significant medical history in your immediate family?",
        "helperText": "Mention conditions like heart disease, diabetes, or cancer in parents or siblings.",
        "inputType": "textarea",
        "options": (
            "No significant family medical history",
            "Heart disease in family",
            "Diabetes in family",
            "Cancer in family",
            "I'm not sure",
        ),
    },
    ClinicalGap.REVIEW_OF_SYSTEMS: {
        "id": "review_of_systems",
        "category": "Review of Systems",
        "prompt": "Are you experiencing any other symptoms or general health concerns?",
        "helperText": "For example: unexplained weight change, persistent fatigue, sleep issues, or skin changes.",
        "inputType": "textarea",
        "options": (
            "No other symptoms",
            "Fatigue or low energy",
            "Dizziness or lightheadedness",
            "Unexplained weight change",
            "Trouble sleeping",
        ),
    },
    ClinicalGap.PERSONAL_DIET: {
        "id": "personal_diet",
        "category": "Personal History: Diet",
        "prompt": "What best describes your usual daily diet?",
        "helperText": "Include whether your diet is vegetarian, non-vegetarian, or vegan.",
        "inputType": "textarea",
        "options": (
            "Vegetarian",
            "Non-vegetarian",
            "Vegan / Plant-based",
            "Mixed / Flexitarian",
            "Not sure",
        ),
    },
    ClinicalGap.PERSONAL_SLEEP: {
        "id": "personal_sleep",
        "category": "Personal History: Sleep",
        "prompt": "How would you describe your sleep pattern and quality?",
        "helperText": "Hours of sleep and whether you wake up feeling rested.",
        "inputType": "textarea",
        "options": (
            "Normal (6-8 hours restful sleep)",
            "Disturbed / Frequent waking",
            "Difficulty falling asleep (Insomnia)",
            "Excessive sleepiness / Daytime fatigue",
            "Not sure",
        ),
    },
    ClinicalGap.PERSONAL_HABITS: {
        "id": "personal_habits",
        "category": "Personal History: Habits",
        "prompt": "Do you consume tobacco, nicotine products, or alcohol?",
        "helperText": "This helps your clinician evaluate cardiovascular and metabolic risks.",
        "inputType": "textarea",
        "options": (
            "None / Never used",
            "Occasional alcohol",
            "Regular alcohol",
            "Smoker / Tobacco user",
            "Past user (now quit)",
            "Prefer not to say",
        ),
    },
    ClinicalGap.PERSONAL_OCCUPATION: {
        "id": "personal_occupation",
        "category": "Personal History: Occupation",
        "prompt": "What is your current occupation or daily routine environment?",
        "helperText": "Physical demands or environment of your daily routine.",
        "inputType": "textarea",
        "options": (
            "Desk / Sedentary work",
            "Active / Field work",
            "Manual labor / Physical",
            "Student",
            "Homemaker / Caregiver",
            "Retired / Not currently working",
            "Not sure",
        ),
    },
}


class InterviewPolicyEngine:
    """Deterministic clinical policy engine governing question validation, coverage tracking, and stopping."""

    EMERGENCY_QUESTION_CEILING: int = 20
    MIN_COVERAGE_FOR_COMPLETION: int = 4  # Chief complaint + at least 1 HPI detail + meds + allergies

    @classmethod
    def evaluate_interview_step(
        cls,
        answers: Mapping[str, Any],
        enable_ai: bool = True,
    ) -> tuple[IntakeState, Optional[IntakeQuestion], Optional[SafetyCheckResult], Optional[str]]:
        """Core hybrid adaptive loop.
        Evaluates safety, accumulated facts, unresolved gaps, AI planning, deterministic validation,
        and defensible stopping conditions.
        
        Returns:
            (state, current_question, safety_escalation, completion_reason)
        """
        # 1. Immediate Deterministic Safety Red Flags Check
        safety_result = evaluate_emergency_safety(answers)
        if safety_result.is_escalated:
            return IntakeState.SAFETY_ESCALATION, None, safety_result, None

        # 2. Extract Chief Complaint
        cc_raw = answers.get("chief_complaint") or answers.get("Chief Complaint")
        cc_text = extract_answer_text(cc_raw)

        if not cc_text.strip():
            # Must ask Chief Complaint first
            q_dict = CURATED_GAP_QUESTIONS[ClinicalGap.CHIEF_COMPLAINT]
            from app.services.interview_engine.none_answers import allows_none
            question = IntakeQuestion(
                id=q_dict["id"],
                category=q_dict["category"],
                prompt=q_dict["prompt"],
                helperText=q_dict.get("helperText"),
                inputType=q_dict.get("inputType", "text"),
                options=q_dict.get("options"),
                gapExplored=ClinicalGap.CHIEF_COMPLAINT,
                purpose="Establish primary reason for consultation",
                allowsNone=allows_none(q_dict["id"]),
            )
            return IntakeState.QUESTION, question, None, None

        # 3. Filter clinical answer keys (excluding metadata and specialized AYUSH branch keys)
        answered_keys = [
            k for k, v in answers.items()
            if not k.startswith("ayush_")
            and k not in ("ayush", "consultation_type", "consultationType")
            and extract_answer_text(v).strip()
        ]

        # 4. Identify Resolved and Unresolved Gaps
        resolved_gaps, unresolved_gaps = identify_unresolved_gaps(answers, cc_text)

        # 5. Check Defensible Stopping Conditions
        if not unresolved_gaps:
            return IntakeState.COMPLETE, None, None, "all_clinical_gaps_resolved"

        # Emergency Question Ceiling Check (Prevent runaway cost / looping when gaps remain unresolved)
        if len(answered_keys) >= cls.EMERGENCY_QUESTION_CEILING:
            return IntakeState.INCOMPLETE, None, None, "emergency_ceiling_reached"

        has_core_coverage = (
            ClinicalGap.CHIEF_COMPLAINT in resolved_gaps
            and (ClinicalGap.HPI_TIMING in resolved_gaps or len(resolved_gaps) >= 3)
            and ClinicalGap.MEDICATIONS in resolved_gaps
            and ClinicalGap.ALLERGIES in resolved_gaps
        )

        # 6. Select the Highest-Priority Unresolved Gap
        target_gap = unresolved_gaps[0]
        curated_template = CURATED_GAP_QUESTIONS.get(target_gap, CURATED_GAP_QUESTIONS[ClinicalGap.REVIEW_OF_SYSTEMS])

        # Previously asked prompts to prevent duplicate questioning
        previously_asked_prompts = []
        for k, v in answers.items():
            if isinstance(v, Mapping) and v.get("prompt"):
                previously_asked_prompts.append(str(v["prompt"]))
            elif k in CURATED_GAP_QUESTIONS:
                previously_asked_prompts.append(CURATED_GAP_QUESTIONS[k]["prompt"])
            else:
                matched = False
                for q_dict in CURATED_GAP_QUESTIONS.values():
                    if q_dict.get("id") == k:
                        previously_asked_prompts.append(q_dict["prompt"])
                        matched = True
                        break
                if not matched:
                    gap_key = k.replace("_followup", "").replace("dynamic_", "").replace("_ext", "")
                    if gap_key in CURATED_GAP_QUESTIONS:
                        previously_asked_prompts.append(CURATED_GAP_QUESTIONS[gap_key]["prompt"])

        # 7. AI-Assisted Question Planning
        ai_plan: Optional[AIQuestionPlan] = None
        if enable_ai:
            try:
                ai_plan = generate_ai_question_plan(
                    complaint_text=cc_text,
                    answers=answers,
                    target_gap=target_gap,
                    previously_asked_prompts=previously_asked_prompts,
                )
            except Exception:
                ai_plan = None

        # 8. Deterministic Validation of AI Proposal
        use_ai_question = False
        if ai_plan and ai_plan.should_continue and ai_plan.proposed_question:
            is_valid = cls._validate_proposed_question(
                proposed_text=ai_plan.proposed_question,
                answers=answers,
                previously_asked_prompts=previously_asked_prompts,
            )
            if is_valid:
                use_ai_question = True

        elif ai_plan and not ai_plan.should_continue and has_core_coverage:
            # AI recommends stopping and core coverage is satisfied
            return IntakeState.COMPLETE, None, None, ai_plan.completion_reason or "ai_and_policy_agreed_complete"

        # 9. Construct the Authoritative Question
        from app.services.interview_engine.none_answers import allows_none
        if use_ai_question and ai_plan and ai_plan.proposed_question:
            canonical_id = curated_template["id"]
            q_id = canonical_id if canonical_id not in answers else f"{canonical_id}_followup"
            # Format options tuple if provided
            opts_tuple = tuple(ai_plan.suggested_options) if ai_plan.suggested_options else curated_template.get("options")
            question = IntakeQuestion(
                id=q_id,
                category=ai_plan.category or curated_template["category"],
                prompt=ai_plan.proposed_question,
                helperText=ai_plan.helper_text or curated_template.get("helperText"),
                inputType=ai_plan.input_type or curated_template.get("inputType", "textarea"),
                options=opts_tuple,
                gapExplored=target_gap,
                purpose=ai_plan.clinical_rationale or f"Explore {target_gap.replace('_', ' ')}",
                allowsNone=allows_none(canonical_id),
            )
        else:
            # Curated Deterministic Fallback Question
            q_id = curated_template["id"]
            question = IntakeQuestion(
                id=q_id,
                category=curated_template["category"],
                prompt=curated_template["prompt"],
                helperText=curated_template.get("helperText"),
                inputType=curated_template.get("inputType", "textarea"),
                options=curated_template.get("options"),
                gapExplored=target_gap,
                purpose=f"Deterministic fallback inquiry for {target_gap.replace('_', ' ')}",
                allowsNone=allows_none(q_id),
            )

        return IntakeState.QUESTION, question, None, None

    @classmethod
    def _get_question_intent(cls, text: str) -> Optional[str]:
        """Classify clinical information focus of a question for semantic duplicate prevention."""
        t = text.lower()
        if re.search(r"\b(how\s+severe|severity|how\s+bad|scale\s+of|how\s+intense|mild[,\s]+moderate|rate\s+(the\s+)?severity|how\s+high\s+(was|is)\s+(the\s+)?(fever|temperature))\b", t):
            return "severity"
        if re.search(r"\b(when\s+did\b.*\b(start|begin)\b|how\s+long\s+have\s+you\s+had|how\s+many\s+days|timeline|duration)\b", t):
            return "timing"
        if re.search(r"\b(describe\s+the\s+feeling|feel\s+like|sharp|dull|throbbing|burning|crampy|character\s+of|nature\s+of\s+the\s+pain)\b", t):
            return "character"
        if re.search(r"\b(where\s+exactly|spread\s+or\s+travel|radiat|location\s+of\s+the)\b", t):
            return "radiation"
        if re.search(r"\b(makes?\s+.*\s+(better|worse)|triggers?|aggravat|reliev|what\s+helps)\b", t):
            return "triggers"
        if re.search(r"\b(any\s+other\s+symptoms|associated\s+symptoms|along\s+with|in\s+addition\s+to|other\s+issues)\b", t):
            return "associated"
        return None

    @classmethod
    def validate_proposed_question(
        cls,
        proposed_text: str,
        answers: Mapping[str, Any],
        previously_asked_prompts: list[str],
    ) -> tuple[bool, str]:
        """Deterministic policy validation of AI proposed question.
        Rejects duplicates, semantic repetitions, diagnostic assertions, treatment advice, and questions on already supplied info.
        """
        clean_prop = proposed_text.strip().lower()
        if len(clean_prop) < 10:
            return False, "too_short"

        # 1. Reject questions introducing unauthorized diagnoses or prescribing advice
        forbidden_patterns = [
            (r"\byou\s+(have|are\s+suffering\s+from)\b", "unauthorized_diagnosis"),
            (r"\bi\s+diagnose\b", "unauthorized_diagnosis"),
            (r"\bdiagnos", "unauthorized_diagnosis"),
            (r"\byou\s+should\s+take\b", "treatment_advice"),
            (r"\btake\s+\d+\s*mg\b", "treatment_advice"),
            (r"\bprescription\s+is\b", "treatment_advice"),
            (r"\bprescribe\b", "treatment_advice"),
        ]
        for pat, reason in forbidden_patterns:
            if re.search(pat, clean_prop):
                return False, reason

        # 2. Check for duplicate phrasing and semantic concept repetition against previously asked prompts
        prop_intent = cls._get_question_intent(clean_prop)
        for asked in previously_asked_prompts:
            clean_asked = asked.strip().lower()
            ratio = difflib.SequenceMatcher(None, clean_prop, clean_asked).ratio()
            if ratio > 0.65:
                return False, "duplicate_question"
            if prop_intent and cls._get_question_intent(clean_asked) == prop_intent:
                return False, f"semantic_duplicate_{prop_intent}"

        # 3. Check if information was already clearly provided in answers
        all_text = " ".join(extract_answer_text(v).lower() for v in answers.values())
        if prop_intent == "timing" and re.search(r"\b(days?\s+ago|weeks?\s+ago|since\s+yesterday|started\s+today|started\s+yesterday)\b", all_text):
            return False, "already_answered_timing"
        if prop_intent == "severity" and re.search(r"\b(mild|moderate|severe|unbearable|excruciating|terrible|high\s+fever|very\s+high|high\s+grade|low\s+grade|10[0-5](\.[0-9])?\s*(°\s*f?|deg(rees)?\s*(f|fahrenheit)?|f\b|fahrenheit\b)?|3[8-9](\.[0-9])?\s*(°\s*c?|deg(rees)?\s*(c|celsius)?|c\b|celsius\b)?|[1-9]\s*/\s*10|10\s*/\s*10)\b", all_text):
            return False, "already_answered_severity"
        if re.search(r"\bwhen\s+did\s+it\s+start\b", clean_prop) and re.search(r"\b(days?\s+ago|weeks?\s+ago|since\s+yesterday)\b", all_text):
            return False, "already_answered"

        return True, "valid"

    @classmethod
    def _validate_proposed_question(
        cls,
        proposed_text: str,
        answers: Mapping[str, Any],
        previously_asked_prompts: list[str],
    ) -> bool:
        is_valid, _ = cls.validate_proposed_question(
            proposed_text=proposed_text,
            answers=answers,
            previously_asked_prompts=previously_asked_prompts,
        )
        return is_valid
