import os
import json
from groq import Groq
from app.schemas.case import AISummary

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
