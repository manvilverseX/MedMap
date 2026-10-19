import os
import json
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

    return {
        "chiefComplaint": cc,
        "historyOfPresentIllness": hpi,
        "pastMedicalHistory": pmh,
        "pastSurgicalHistory": psh,
        "medications": meds,
        "allergies": allergies,
        "familyHistory": fam,
        "reviewOfSystems": ros,
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

class AnswerValidation(BaseModel):
    needs_clarification: bool
    clarifying_question: str | None

def validate_answer_with_llm(question_prompt: str, answer_text: str) -> AnswerValidation:
    """Validate if a patient's answer needs clarification."""
    # Fast path for obvious valid answers
    stripped = answer_text.strip().casefold()
    if not stripped or stripped in ("no", "none", "n/a", "na", "nothing", "yes"):
        return AnswerValidation(needs_clarification=False, clarifying_question=None)
        
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return AnswerValidation(needs_clarification=False, clarifying_question=None)
    
    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    client = Groq(api_key=api_key)
    
    schema_dict = AnswerValidation.model_json_schema()
    schema_dict["additionalProperties"] = False
    
    prompt = f"""
    You are an AI assistant helping with a medical intake form. 
    The patient was asked: "{question_prompt}"
    The patient answered: "{answer_text}"
    
    Determine if the answer is confusing, nonsensical, or clearly missing critical context required for the question.
    If the answer is reasonably clear (even if brief), return needs_clarification=False.
    If the answer is a simple greeting, completely unrelated, or vague like "Recently", return needs_clarification=True and provide a brief, polite clarifying_question asking for the missing detail (e.g. "Could you give an approximate duration, such as a few hours, days, or weeks?").
    Do NOT ask for clarification if the answer is merely short but makes sense in context.
    """
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "answer_validation",
                    "strict": True,
                    "schema": schema_dict,
                },
            }
        )
        
        result_text = response.choices[0].message.content
        return AnswerValidation.model_validate_json(result_text)
    except Exception as e:
        # If LLM fails, fallback to accepting the answer to avoid blocking the user
        import logging
        logging.error(f"Clarification validation failed: {e}")
        return AnswerValidation(needs_clarification=False, clarifying_question=None)
