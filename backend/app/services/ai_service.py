import os
import json
from groq import Groq
from pydantic import BaseModel
from app.schemas.case import AISummary
from dotenv import load_dotenv

load_dotenv()

def generate_clinical_brief(intake_answers: dict) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    
    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    
    client = Groq(api_key=api_key)
    
    schema_dict = AISummary.model_json_schema()
    schema_dict["additionalProperties"] = False
    schema_dict["required"] = list(schema_dict["properties"].keys())
    
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
            }
        )
        
        result_text = response.choices[0].message.content
        if not result_text:
            raise ValueError("Provider returned empty response")
            
        validated_summary = AISummary.model_validate_json(result_text)
        return validated_summary.model_dump()
        
    except Exception as e:
        raise RuntimeError(f"AI Generation Failed: {str(e)}")

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
        raise ValueError("GROQ_API_KEY environment variable is not set")
    
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
