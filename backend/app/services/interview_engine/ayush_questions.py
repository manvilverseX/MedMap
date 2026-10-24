"""
AYUSH / Ayurveda Clinical Intake Pathway (Draft Questionnaire)
Covers the 10 Dashavidha Pariksha parameters plus Agni, Koshtha, Ahara-Vihara, and Nidana.

NOTE: This questionnaire is a draft for pre-consultation collection.
DISCLAIMER: Requires review by a qualified Ayurvedic practitioner.
No automatic Prakriti diagnosis is generated.
"""

from typing import Any, Mapping, Optional
from app.schemas.intake import IntakeQuestion

# Question set covering the 10 Dashavidha Pariksha parameters + Agni, Koshtha, Ahara-Vihara, Nidana
AYUSH_QUESTIONS: tuple[IntakeQuestion, ...] = (
    IntakeQuestion(
        id="ayush_prakriti",
        category="Ayurveda: Prakriti (Constitution)",
        prompt="Which physical and thermal tendencies best describe your natural constitution since childhood?",
        helperText="Your lifelong baseline traits (not current sickness).",
        inputType="textarea",
        options=(
            "Slender/light frame, dry skin, sensitive to cold/wind (Vata-dominant)",
            "Medium frame, warm body, sweats easily, sensitive to heat (Pitta-dominant)",
            "Broad/solid frame, oily skin, steady energy, dislikes damp/cold (Kapha-dominant)",
            "Balanced mix of two or three tendencies",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_vikriti",
        category="Ayurveda: Vikriti (Current Imbalance)",
        prompt="What active bodily sensations or imbalances are you noticing right now?",
        helperText="Current disturbances in sensation, digestion, or bodily comfort.",
        inputType="textarea",
        options=(
            "Dryness, gas/bloating, restlessness, or body ache (Vata imbalance)",
            "Acidity, burning sensation, excessive heat, or irritability (Pitta imbalance)",
            "Heaviness, sluggishness, congestion, or excess mucus (Kapha imbalance)",
            "Combination of dryness and burning heat",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_sara",
        category="Ayurveda: Sara (Tissue Vitality)",
        prompt="How would you assess your overall tissue vitality, stamina, and bone/skin strength?",
        helperText="The quality and resilience of your body tissues.",
        inputType="textarea",
        options=(
            "High vitality (firm musculature, radiant skin, strong bones)",
            "Moderate vitality (average muscle tone and steady stamina)",
            "Low vitality (easily fatigued, fragile nails/hair, low endurance)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_samhanana",
        category="Ayurveda: Samhanana (Body Compactness)",
        prompt="How would you describe your body compactness and joint firmness?",
        helperText="Firmness and symmetry of your physical structure.",
        inputType="textarea",
        options=(
            "Compact, symmetrical, well-knit joints (Susamhata)",
            "Medium compactness and symmetry (Madhyama)",
            "Loose-jointed, less compact, or uneven build (Heena)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_pramana",
        category="Ayurveda: Pramana (Body Proportions)",
        prompt="How would you describe your body measurements and proportions?",
        helperText="Balance between height, frame, and limb proportions.",
        inputType="textarea",
        options=(
            "Evenly proportionate height and frame (Pramana)",
            "Tending toward underweight or disproportionately slender",
            "Tending toward overweight or disproportionately heavy",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_satmya",
        category="Ayurveda: Satmya (Adaptability)",
        prompt="How easily do you adapt to changes in weather, varied food, and new environments?",
        helperText="Your body's habituation and adaptability to changes.",
        inputType="textarea",
        options=(
            "Easily adaptable to varied foods and climates (Pravara Satmya)",
            "Moderately adaptable with minor transient adjustments (Madhyama)",
            "Sensitive to seasonal shifts or unfamiliar food (Avara Satmya)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_sattva",
        category="Ayurveda: Sattva (Mental Resilience)",
        prompt="How do you typically respond to emotional stress or challenging situations?",
        helperText="Your psychological stamina, focus, and emotional equilibrium.",
        inputType="textarea",
        options=(
            "Calm, patient, and resilient under pressure (Pravara Sattva)",
            "Moderate resilience; occasionally stressed but recover (Madhyama)",
            "Easily anxious, overwhelmed, or despondent (Avara Sattva)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_ahara_shakti",
        category="Ayurveda: Ahara Shakti (Digestive Capacity)",
        prompt="How is your food intake capacity and digestion speed?",
        helperText="Both your meal volume capacity and how comfortably you digest within 3-4 hours.",
        inputType="textarea",
        options=(
            "Good appetite, digests meals comfortably in 3-4 hours (Pravara)",
            "Strong/sharp hunger, digests very quickly with acid tendency",
            "Variable appetite, digestion feels erratic or bloated",
            "Low appetite, food feels heavy or slow to digest (Manda)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_vyayama_shakti",
        category="Ayurveda: Vyayama Shakti (Physical Endurance)",
        prompt="What is your capacity for physical exercise and strenuous daily activities?",
        helperText="Your endurance before feeling breathless or exhausted.",
        inputType="textarea",
        options=(
            "High endurance (can perform vigorous exercise without quick exhaustion)",
            "Moderate endurance (comfortable with brisk walking or routine exertion)",
            "Low endurance (breathless or exhausted quickly with mild exertion)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_vaya",
        category="Ayurveda: Vaya (Life Stage)",
        prompt="Which life stage (Vaya) best reflects your current age and biological phase?",
        helperText="Ayurvedic life stage classification.",
        inputType="textarea",
        options=(
            "Balya / Youth (under 25 years)",
            "Madhyama / Adult / Middle stage (25 to 60 years)",
            "Vardhakya / Elder (above 60 years)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_agni",
        category="Ayurveda: Agni (Metabolic Fire)",
        prompt="Which best describes your metabolic and digestive fire (Agni)?",
        helperText="Regularity and comfort of your digestive metabolism.",
        inputType="textarea",
        options=(
            "Sama Agni (Balanced digestion, comfortable after meals)",
            "Vishama Agni (Irregular digestion, gas, alternating appetite)",
            "Tikshna Agni (Intense burning hunger, hyperacidity, frequent loose stools)",
            "Manda Agni (Sluggish digestion, heaviness, low appetite)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_koshtha",
        category="Ayurveda: Koshtha (Bowel Habit)",
        prompt="What is your usual bowel habit (Koshtha)?",
        helperText="Tendency of your digestive tract movement.",
        inputType="textarea",
        options=(
            "Krura Koshtha (Hard, dry stools; prone to constipation)",
            "Mridu Koshtha (Soft, loose stools; easily stimulated by milk/fruits)",
            "Madhyama Koshtha (Regular, well-formed stools once or twice daily)",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_ahara_vihara",
        category="Ayurveda: Ahara-Vihara (Diet & Lifestyle)",
        prompt="What daily dietary and routine habits are most consistent in your life?",
        helperText="Daily meal patterns, temperature of food, and sleep habits.",
        inputType="textarea",
        options=(
            "Regular warm home-cooked meals, consistent sleep schedule",
            "Irregular meal timings, frequent cold/packaged food, late nights",
            "Spicy, oily, or fried foods with high-stress work routine",
            "Heavy or sweet foods, sedentary routine, daytime naps",
            "Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_nidana",
        category="Ayurveda: Nidana (Perceived Causes / Triggers)",
        prompt="Have you noticed any specific lifestyle triggers, weather, or foods that worsen your symptoms?",
        helperText="Triggers you suspect may be contributing to your current complaint.",
        inputType="textarea",
        options=(
            "Cold wind, winter weather, or travel",
            "Hot/humid weather, spicy food, or sour items",
            "Damp weather, sweet/dairy foods, or lack of exercise",
            "Mental stress, irregular sleep, or skipping meals",
            "No obvious trigger noticed / Not sure",
        ),
    ),
    IntakeQuestion(
        id="ayush_samprapti",
        category="Ayurveda: Samprapti (Progression)",
        prompt="How did your illness start and progress? What makes it better or worse (such as food, season, stress, or sleep), and did it come on gradually or suddenly?",
        helperText="Patient-reported progression history: onset, factors affecting symptoms, and timeline.",
        inputType="textarea",
        allowsNone=False,
        options=(
            "Started suddenly and worsened rapidly",
            "Came on gradually over time",
            "Worse with cold weather or seasonal change",
            "Worse with heavy, spicy, or irregular food",
            "Worse with stress, anxiety, or lack of sleep",
            "Variable with no clear pattern / Not sure",
        ),
    ),
)

AYUSH_QUESTION_MAP: dict[str, IntakeQuestion] = {q.id: q for q in AYUSH_QUESTIONS}


def is_ayush_consultation(answers: Mapping[str, Any]) -> bool:
    """Return True if case is designated for the AYUSH/Ayurveda pathway."""
    if not answers:
        return False
    consult_type = answers.get("consultation_type") or answers.get("consultationType")
    if isinstance(consult_type, str) and consult_type.lower() in ("ayush", "ayurveda", "ayush_ayurveda"):
        return True
    if "ayush" in answers and isinstance(answers["ayush"], dict):
        return True
    # If any AYUSH question has been answered
    for q in AYUSH_QUESTIONS:
        if q.id in answers:
            return True
    return False


def get_ayush_question(question_id: str) -> Optional[IntakeQuestion]:
    return AYUSH_QUESTION_MAP.get(question_id)


def get_next_ayush_question(answers: Mapping[str, Any]) -> Optional[IntakeQuestion]:
    """Return the next unanswered AYUSH question in sequence, or None if all completed."""
    ayush_nested = answers.get("ayush") if isinstance(answers.get("ayush"), dict) else {}
    for q in AYUSH_QUESTIONS:
        # Check if answered either in flat answers (q.id) or in nested ayush dict (param name without ayush_)
        short_key = q.id.replace("ayush_", "")
        if q.id in answers:
            continue
        if short_key in ayush_nested:
            continue
        return q
    return None


def sync_ayush_answers(answers: dict[str, Any]) -> dict[str, Any]:
    """Ensure answers to ayush_* questions are mirrored into the answers['ayush'] sub-dictionary."""
    ayush_dict = dict(answers.get("ayush", {})) if isinstance(answers.get("ayush"), dict) else {}
    for q in AYUSH_QUESTIONS:
        short_key = q.id.replace("ayush_", "")
        if q.id in answers:
            val = answers[q.id]
            val_text = val if isinstance(val, str) else (val.get("value") if isinstance(val, dict) else str(val))
            ayush_dict[short_key] = val_text
        elif short_key in ayush_dict:
            answers[q.id] = ayush_dict[short_key]
    if ayush_dict:
        answers["ayush"] = ayush_dict
    return answers
