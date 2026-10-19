import json
import uuid
from datetime import datetime, timezone

class ClinicalRuleEngine:
    @staticmethod
    def evaluate_case(case_data: dict) -> list:
        flags = []
        answers = case_data.get("intakeAnswers", {})
        
        # 1. Anaphylaxis rule
        allergies = answers.get("allergies_reaction", "").lower()
        if "anaphylaxis" in allergies or "shock" in allergies:
            flags.append({
                "id": str(uuid.uuid4()),
                "category": "allergy",
                "severity": "CRITICAL",
                "evidence": allergies,
                "explanation": "History of severe allergic reaction (Anaphylaxis)",
                "source": "patient_reported",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "requires_review"
            })
            
        # 2. Chest pain rule
        cc = answers.get("chief_complaint", "").lower()
        if "chest pain" in cc or "heart attack" in cc:
            flags.append({
                "id": str(uuid.uuid4()),
                "category": "cardiac",
                "severity": "HIGH",
                "evidence": cc,
                "explanation": "Reported chest pain requires immediate clinical assessment",
                "source": "patient_reported",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "requires_review"
            })

        return flags

def process_medication_intelligence(case_data: dict, new_documents: list) -> dict:
    medications = {}
    
    # Simple placeholder logic to map extracted medications to a structured intelligence view
    for doc in new_documents:
        if not doc.get("medicalEntities"):
            continue
            
        for med in doc["medicalEntities"].get("medications", []):
            med_name = med.get("name", "Unknown").lower()
            if med_name not in medications:
                medications[med_name] = {
                    "name": med_name,
                    "records": []
                }
            
            medications[med_name]["records"].append({
                "dose": med.get("dose"),
                "frequency": med.get("frequency"),
                "source_doc": doc.get("id"),
                "timestamp": doc.get("createdAt")
            })
            
    # Detect duplicates or conflicting dosages
    for med_name, data in medications.items():
        records = data["records"]
        data["is_duplicate"] = len(records) > 1
        data["conflict"] = False
        if len(records) > 1:
            first_dose = records[0]["dose"]
            if any(r["dose"] != first_dose for r in records):
                data["conflict"] = True
                
    return medications

