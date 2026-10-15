import json
import logging
import os
from typing import Any, Mapping, Optional
from groq import Groq
from pydantic import BaseModel


class AIQuestionPlan(BaseModel):
    should_continue: bool = True
    completion_reason: Optional[str] = None
    gap_addressed: Optional[str] = None
    proposed_question: Optional[str] = None
    helper_text: Optional[str] = None
    category: Optional[str] = None
    input_type: str = "textarea"
    suggested_options: Optional[list[str]] = None
    clinical_rationale: Optional[str] = None
    safety_concern_flagged: bool = False
    safety_notes: Optional[str] = None


def generate_ai_question_plan(
    complaint_text: str,
    answers: Mapping[str, Any],
    target_gap: str,
    previously_asked_prompts: list[str],
) -> Optional[AIQuestionPlan]:
    """Uses Groq LLM with strict structured JSON output to propose the next patient-specific question.
    Returns None if LLM is unavailable or fails, allowing seamless deterministic fallback.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None

    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    client = Groq(api_key=api_key)

    # Format answers for context
    clean_history = {}
    for k, v in answers.items():
        if isinstance(v, str):
            clean_history[k] = v
        elif isinstance(v, Mapping):
            clean_history[k] = v.get("value") or v.get("originalValue") or ""

    schema_dict = AIQuestionPlan.model_json_schema()
    schema_dict["additionalProperties"] = False
    schema_dict["required"] = list(schema_dict["properties"].keys())

    prompt = f"""
You are an AI Clinical History Interview Planner assisting a doctor by taking a pre-consultation medical history.
Your goal is to propose ONE patient-friendly, focused question to explore a specific clinical information gap for this individual patient.

PATIENT'S CHIEF COMPLAINT:
"{complaint_text}"

CURRENT ACCUMULATED ANSWERS:
{json.dumps(clean_history, indent=2)}

TARGET INFORMATION GAP TO EXPLORE NEXT:
"{target_gap}"

PREVIOUSLY ASKED QUESTIONS (DO NOT REPEAT OR PHRASE SIMILARLY):
{json.dumps(previously_asked_prompts, indent=2)}

STRICT CLINICAL RULES:
1. Propose ONE focused, polite question aimed specifically at exploring "{target_gap}" for this patient's symptoms.
2. If the answer was ALREADY provided in previous answers, or if further questioning is not useful, set should_continue=false.
3. DO NOT DIAGNOSE the patient (e.g. do not say "Since you have gastritis...").
4. DO NOT PRESCRIBE or recommend treatments (e.g. do not recommend medications).
5. DO NOT invent patient symptoms or facts.
6. Provide 2-4 concise, helpful suggested options/pills if applicable to make answering easier.
7. Always provide a clear clinical rationale explaining why this question helps the doctor prepare for the consultation.
"""

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "ai_question_plan",
                    "strict": True,
                    "schema": schema_dict,
                },
            },
            temperature=0.2,
        )

        result_text = response.choices[0].message.content
        if not result_text:
            return None

        plan = AIQuestionPlan.model_validate_json(result_text)
        return plan

    except Exception as e:
        logging.warning(f"AI Question Planner fallback engaged: {e}")
        return None
