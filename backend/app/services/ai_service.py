import os
import json
from typing import Optional
from groq import Groq
from pydantic import BaseModel
from app.schemas.case import AISummary
from dotenv import load_dotenv

load_dotenv()

import logging

logger = logging.getLogger(__name__)

def generate_clinical_brief_fallback(intake_answers: dict) -> dict:
    """Deterministic, safety-compliant clinical brief fallback when AI is offline or key is missing."""
    def extract_val(key: str, default: str | None = None) -> str | None:
        raw = intake_answers.get(key)
        if isinstance(raw, dict):
            val = raw.get("value") or raw.get("originalValue")
            if val and str(val).strip():
                return str(val).strip()
            return default
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return default

    cc = extract_val("chief_complaint", "Patient presents for consultation.")
    hpi = extract_val("present_illness") or extract_val("hpi_timing") or "Patient provided symptom history during intake."
    pmh = extract_val("past_medical", "No prior medical conditions reported.")
    psh = extract_val("past_surgical")
    meds = extract_val("medications")
    allergies = extract_val("allergies")
    allergy_reaction = extract_val("allergy_reaction")
    if allergies and allergy_reaction:
        allergies = f"{allergies} (Reaction: {allergy_reaction})"
    fam = extract_val("family_history")
    ros = extract_val("review_of_systems")
    prev_inv = extract_val("previous_investigations")
    other_hist = extract_val("other_history")

    return {
        "chiefComplaint": cc,
        "historyOfPresentIllness": hpi,
        "pastMedicalHistory": pmh,
        "pastSurgicalHistory": psh,
        "medications": meds,
        "allergies": allergies,
        "familyHistory": fam,
        "reviewOfSystems": ros,
        "previousInvestigations": prev_inv,
        "otherHistory": other_hist,
        "source": "offline_demo_fallback",
    }

def generate_clinical_brief(intake_answers: dict) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        logger.info("GROQ_API_KEY is not set. Using deterministic offline demo fallback for clinical brief.")
        return generate_clinical_brief_fallback(intake_answers)
    
    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    
    schema_dict = AISummary.model_json_schema()
    schema_dict["additionalProperties"] = False
    
    prompt = f"""
    You are a medical summarization assistant. Review the following patient intake answers and generate a comprehensive clinical brief.
    
    IMPORTANT CLINICAL SAFETY REQUIREMENTS:
    - Summarize ONLY information actually present in the patient answers.
    - NEVER invent symptoms, diagnoses, medications, history, or findings.
    - Preserve uncertainty.
    - DO NOT infer a diagnosis from symptoms.
    - DO NOT provide treatment recommendations.
    - DO NOT add information that is absent.
    - If a specific clinical category has no patient-provided information, return null.

    Specifically, organize the patient's information into these categories based on their intake:
    1. Chief Complaint
    2. History of Present Illness
    3. Past Medical History
    4. Past Surgical History
    5. Medications
    6. Allergies
    7. Family History
    8. Review of Systems
    9. Previous Investigations
    10. Other Relevant History
    
    Patient Intake Answers:
    {json.dumps(intake_answers, indent=2)}
    """
    
    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "ai_summary",
                    "strict": True,
                    "schema": schema_dict,
                },
            },
            timeout=15.0
        )
        
        result_text = response.choices[0].message.content
        if not result_text:
            raise ValueError("Provider returned empty response")
            
        validated_summary = AISummary.model_validate_json(result_text)
        data = validated_summary.model_dump()
        data["source"] = "groq"
        return data
        
    except Exception as e:
        logger.warning(f"Groq AI Generation failed ({type(e).__name__}: {str(e)}). Using offline demo fallback.")
        return generate_clinical_brief_fallback(intake_answers)

class GroqValidationSchema(BaseModel):
    valid: bool
    reason_code: Optional[str] = None
    clarifying_question: Optional[str] = None


class AnswerValidation(BaseModel):
    valid: bool = True
    reason_code: Optional[str] = None
    clarifying_question: Optional[str] = None
    relevance_unchecked: bool = False

    @property
    def needs_clarification(self) -> bool:
        return not self.valid


def validate_answer_with_llm(question_prompt: str, answer_text: str) -> AnswerValidation:
    """Validate if a patient's answer is relevant and clinically plausible for this question."""
    # Fast path for obvious valid answers
    from app.services.interview_engine.none_answers import is_none_answer
    stripped = answer_text.strip().casefold()
    if not stripped or is_none_answer(answer_text) or stripped in (
        "no", "none", "n/a", "na", "nothing", "yes", "denies",
        "not sure", "don't know", "dont know", "never", "unknown"
    ):
        return AnswerValidation(valid=True, clarifying_question=None)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return AnswerValidation(valid=True, relevance_unchecked=True)

    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    client = Groq(api_key=api_key)

    schema_dict = GroqValidationSchema.model_json_schema()
    schema_dict["additionalProperties"] = False
    schema_dict["required"] = ["valid", "reason_code", "clarifying_question"]

    prompt = f"""You are a clinical intake validation assistant.
The clinical question asked: "{question_prompt}"
The patient's answer: "{answer_text}"

Evaluate whether the answer is a plausible, relevant response to THIS question.
Rules:
1. Plausible medical descriptions, symptoms, duration, feelings, history, or uncertainty (e.g. "I don't know", "Not sure", "None", "No", "Yes") are VALID (valid=true, reason_code=null, clarifying_question=null).
2. Off-topic statements (e.g. discussing weather, food recipes, movies, politics, or unrelated topics) are INVALID: return valid=false, reason_code="ANSWER_NOT_RELEVANT", clarifying_question="Your answer does not seem related to this question. Please answer what was asked, or type 'Not sure'."
3. Confusing, nonsensical, or vague single terms (e.g. "sick", "problem") that lack critical context: return valid=false, reason_code="ANSWER_INVALID", clarifying_question="Could you please describe what specific symptoms you are experiencing?"
4. Return ONLY strict JSON adhering to the schema.
"""

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "answer_validation",
                    "strict": True,
                    "schema": schema_dict,
                },
            },
            timeout=3.5,
        )

        result_text = response.choices[0].message.content or ""
        parsed = GroqValidationSchema.model_validate_json(result_text)
        return AnswerValidation(
            valid=parsed.valid,
            reason_code=parsed.reason_code if not parsed.valid else None,
            clarifying_question=parsed.clarifying_question if not parsed.valid else None,
            relevance_unchecked=False,
        )
    except Exception as e:
        logger.warning(
            "Groq answer relevance validation failed (%s). Falling back to deterministic checks.",
            e,
        )
        return AnswerValidation(valid=True, relevance_unchecked=True)
