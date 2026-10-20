"""Interview Engine package for MedMap.
Provides hybrid AI-assisted clinical history interview with deterministic safety and policy oversight.
"""

from app.services.interview_engine.safety_evaluator import evaluate_emergency_safety, SafetyCheckResult
from app.services.interview_engine.clinical_gaps import ClinicalGap, extract_clinical_facts, identify_unresolved_gaps, has_reported_allergy
from app.services.interview_engine.ai_planner import generate_ai_question_plan, AIQuestionPlan
from app.services.interview_engine.policy_engine import InterviewPolicyEngine

__all__ = [
    "evaluate_emergency_safety",
    "SafetyCheckResult",
    "ClinicalGap",
    "extract_clinical_facts",
    "identify_unresolved_gaps",
    "has_reported_allergy",
    "generate_ai_question_plan",
    "AIQuestionPlan",
    "InterviewPolicyEngine",
]
