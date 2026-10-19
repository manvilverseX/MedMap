import re
from typing import Any, Mapping, Optional
from pydantic import BaseModel


class ClinicalGap:
    CHIEF_COMPLAINT = "chief_complaint"
    HPI_TIMING = "hpi_timing"  # onset, duration, progression
    HPI_CHARACTER = "hpi_character"  # nature, quality (sharp, dull, throbbing, etc.)
    HPI_SEVERITY = "hpi_severity"  # 1-10 scale or functional limitation
    HPI_RADIATION = "hpi_radiation"  # location and spread/radiation
    HPI_TRIGGERS = "hpi_triggers"  # aggravating & relieving factors
    HPI_ASSOCIATED = "hpi_associated"  # associated symptoms & pertinent negatives
    MEDICATIONS = "medications"  # prescriptions, OTC, supplements
    ALLERGIES = "allergies"  # allergies to meds, foods, latex
    ALLERGY_REACTION = "allergy_reaction"  # reactions (hives, anaphylaxis)
    PAST_MEDICAL = "past_medical"  # chronic conditions
    PAST_SURGICAL = "past_surgical"  # previous procedures
    FAMILY_HISTORY = "family_history"  # family risk factors
    REVIEW_OF_SYSTEMS = "review_of_systems"  # systemic review
    PERSONAL_DIET = "personal_diet"  # dietary pattern
    PERSONAL_SLEEP = "personal_sleep"  # sleep quality & pattern
    PERSONAL_HABITS = "personal_habits"  # tobacco, nicotine, alcohol
    PERSONAL_OCCUPATION = "personal_occupation"  # occupation & daily environment


# Mapping of question ID to the gap it addresses
QUESTION_ID_TO_GAP: dict[str, str] = {
    "chief_complaint": ClinicalGap.CHIEF_COMPLAINT,
    "present_illness": ClinicalGap.HPI_TIMING,
    "hpi_timing": ClinicalGap.HPI_TIMING,
    "hpi_character": ClinicalGap.HPI_CHARACTER,
    "hpi_severity": ClinicalGap.HPI_SEVERITY,
    "hpi_radiation": ClinicalGap.HPI_RADIATION,
    "hpi_triggers": ClinicalGap.HPI_TRIGGERS,
    "hpi_associated": ClinicalGap.HPI_ASSOCIATED,
    "medications": ClinicalGap.MEDICATIONS,
    "allergies": ClinicalGap.ALLERGIES,
    "allergy_reaction": ClinicalGap.ALLERGY_REACTION,
    "past_medical": ClinicalGap.PAST_MEDICAL,
    "past_surgical": ClinicalGap.PAST_SURGICAL,
    "family_history": ClinicalGap.FAMILY_HISTORY,
    "review_of_systems": ClinicalGap.REVIEW_OF_SYSTEMS,
    "personal_diet": ClinicalGap.PERSONAL_DIET,
    "personal_sleep": ClinicalGap.PERSONAL_SLEEP,
    "personal_habits": ClinicalGap.PERSONAL_HABITS,
    "personal_occupation": ClinicalGap.PERSONAL_OCCUPATION,
}


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


def classify_chief_complaint(complaint_text: str) -> str:
    """Classify the presenting complaint into a clinical syndrome category."""
    text = complaint_text.lower()
    
    if re.search(r"\b(chest|heart|palpitation|pressure in chest)\b", text):
        return "cardiac"
    if re.search(r"\b(breath|cough|wheez|asthma|phlegm|sputum|shortness of breath|lungs)\b", text):
        return "respiratory"
    if re.search(r"\b(stomach|abdom|belly|nausea|vomit|diarrhea|cramp|constipat|gut|acid|indigestion)\b", text):
        return "gastrointestinal"
    if re.search(r"\b(headache|migraine|dizzy|lighthead|vertigo|vision|numb|tingl|seizure)\b", text):
        return "neurological"
    if re.search(r"\b(fever|chills|sweat|temperature|shiver|flu|cold|sore throat|infect)\b", text):
        return "fever"
    if re.search(r"\b(back|joint|knee|shoulder|neck|muscle|sprain|fracture|bone|pain|ache)\b", text):
        return "musculoskeletal"
    if re.search(r"\b(rash|skin|itch|hives|lesion|bump|spot|wound|burn)\b", text):
        return "dermatological"
    
    return "general"


def determine_required_gaps(
    complaint_text: str,
    current_answers: Optional[Mapping[str, Any]] = None,
) -> list[str]:
    """Dynamically determine the prioritized clinical gaps based on the patient's individual complaint
    and current interview stage.
    """
    if not complaint_text:
        return [ClinicalGap.CHIEF_COMPLAINT]

    syndrome = classify_chief_complaint(complaint_text)

    consult_type = ""
    if current_answers:
        consult_type = str(current_answers.get("consultation_type") or current_answers.get("consultationType") or "").lower()

    include_personal_history = bool(
        consult_type in ("general", "ayush")
        or any(
            k in (current_answers or {})
            for k in (
                ClinicalGap.PERSONAL_DIET,
                ClinicalGap.PERSONAL_SLEEP,
                ClinicalGap.PERSONAL_HABITS,
                ClinicalGap.PERSONAL_OCCUPATION,
            )
        )
    )

    # Core background and contextual domains
    background_gaps = [
        ClinicalGap.PAST_MEDICAL,
        ClinicalGap.PAST_SURGICAL,
        ClinicalGap.MEDICATIONS,
        ClinicalGap.ALLERGIES,
        ClinicalGap.FAMILY_HISTORY,
        ClinicalGap.REVIEW_OF_SYSTEMS,
    ]
    if include_personal_history:
        background_gaps.extend([
            ClinicalGap.PERSONAL_DIET,
            ClinicalGap.PERSONAL_SLEEP,
            ClinicalGap.PERSONAL_HABITS,
            ClinicalGap.PERSONAL_OCCUPATION,
        ])

    # Check if the interview has already advanced into the medical background stage
    has_background_answers = False
    if current_answers:
        for bg in [
            ClinicalGap.PAST_MEDICAL,
            ClinicalGap.PAST_SURGICAL,
            ClinicalGap.MEDICATIONS,
            ClinicalGap.ALLERGIES,
        ]:
            if bg in current_answers:
                has_background_answers = True
                break


    # If the patient has already progressed to background questions, maintain natural forward clinical stage
    if has_background_answers:
        return [ClinicalGap.CHIEF_COMPLAINT, ClinicalGap.HPI_TIMING] + background_gaps

    # Dynamic HPI gaps based on the syndrome when in the active symptom exploration stage
    if syndrome == "cardiac":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_CHARACTER,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_RADIATION,
            ClinicalGap.HPI_ASSOCIATED,
        ]
    elif syndrome == "gastrointestinal":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_CHARACTER,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_TRIGGERS,
            ClinicalGap.HPI_ASSOCIATED,
        ]
    elif syndrome == "fever":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_ASSOCIATED,
        ]
    elif syndrome == "respiratory":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_ASSOCIATED,
            ClinicalGap.HPI_TRIGGERS,
        ]
    elif syndrome == "neurological":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_CHARACTER,
            ClinicalGap.HPI_ASSOCIATED,
        ]
    elif syndrome == "musculoskeletal":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_CHARACTER,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_TRIGGERS,
        ]
    elif syndrome == "dermatological":
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_CHARACTER,
            ClinicalGap.HPI_ASSOCIATED,
        ]
    else:  # general
        hpi_gaps = [
            ClinicalGap.HPI_TIMING,
            ClinicalGap.HPI_SEVERITY,
            ClinicalGap.HPI_ASSOCIATED,
        ]

    # Assembled in clinical priority order
    return [ClinicalGap.CHIEF_COMPLAINT] + hpi_gaps + background_gaps


def extract_clinical_facts(answers: Mapping[str, Any]) -> dict[str, Any]:
    """Map answers to extracted clinical facts and gap resolution statuses."""
    facts: dict[str, Any] = {}
    
    for q_id, raw_val in answers.items():
        text = extract_answer_text(raw_val)
        base_id = q_id.replace("_followup", "").replace("dynamic_", "").replace("_ext", "")
        gap = QUESTION_ID_TO_GAP.get(q_id) or QUESTION_ID_TO_GAP.get(base_id, q_id)
        
        is_uncertain = is_uncertain_answer(text)
        is_skipped = not text.strip()
        
        facts[gap] = {
            "questionId": q_id,
            "text": text,
            "resolved": bool(text.strip()),
            "isUncertain": is_uncertain,
            "isSkipped": is_skipped,
        }

    # Cross-answer inference: verify if accumulated patient text already resolved gaps
    all_text = " ".join(extract_answer_text(v).lower() for v in answers.values())
    if ClinicalGap.HPI_SEVERITY not in facts:
        # Check if severity or temperature was explicitly provided in chief complaint or illness narrative
        if re.search(r"\b(mild|moderate|severe|unbearable|excruciating|terrible|high\s+fever|very\s+high|high\s+grade|low\s+grade|10[0-5](\.[0-9])?\s*(°\s*f?|deg(rees)?\s*(f|fahrenheit)?|f\b|fahrenheit\b)?|3[8-9](\.[0-9])?\s*(°\s*c?|deg(rees)?\s*(c|celsius)?|c\b|celsius\b)?|[1-9]\s*/\s*10|10\s*/\s*10)\b", all_text):
            facts[ClinicalGap.HPI_SEVERITY] = {
                "questionId": "inferred_severity",
                "text": "Severity information provided in clinical narrative",
                "resolved": True,
                "isUncertain": False,
                "isSkipped": False,
            }

    if ClinicalGap.HPI_TIMING not in facts:
        if re.search(r"\b(days?\s+ago|weeks?\s+ago|months?\s+ago|since\s+yesterday|started\s+today|started\s+yesterday|began\s+today|began\s+yesterday)\b", all_text):
            facts[ClinicalGap.HPI_TIMING] = {
                "questionId": "inferred_timing",
                "text": "Timing information provided in clinical narrative",
                "resolved": True,
                "isUncertain": False,
                "isSkipped": False,
            }
        
    return facts


def identify_unresolved_gaps(
    answers: Mapping[str, Any],
    complaint_text: str,
) -> tuple[list[str], list[str]]:
    """Determine which clinical gaps have been resolved and which remain unresolved.
    Returns (resolved_gaps, unresolved_gaps).
    """
    facts = extract_clinical_facts(answers)
    all_needed_gaps = determine_required_gaps(complaint_text, current_answers=answers)

    # Allergy reaction is dependent on allergies being present
    allergy_val = extract_answer_text(answers.get("allergies", ""))
    has_allergy = allergy_val and allergy_val.lower() not in (
        "no", "none", "no known allergies", "no allergies", "n/a", "na", "nil", "nothing", "denies"
    )

    resolved_gaps: list[str] = []
    unresolved_gaps: list[str] = []

    for gap in all_needed_gaps:
        if gap == ClinicalGap.ALLERGY_REACTION and not has_allergy:
            continue  # Not applicable, don't mark as unresolved gap
            
        if gap in facts and (facts[gap]["resolved"] or facts[gap]["isUncertain"] or facts[gap]["isSkipped"]):
            resolved_gaps.append(gap)
        else:
            unresolved_gaps.append(gap)

    # Insert allergy reaction follow-up if patient reported allergy and reaction is unresolved
    if has_allergy and ClinicalGap.ALLERGY_REACTION not in resolved_gaps and ClinicalGap.ALLERGIES in resolved_gaps:
        # Place immediately after allergies
        if ClinicalGap.ALLERGY_REACTION not in unresolved_gaps:
            unresolved_gaps.insert(0, ClinicalGap.ALLERGY_REACTION)

    return resolved_gaps, unresolved_gaps

