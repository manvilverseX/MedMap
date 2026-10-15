import re
from typing import Any, Mapping, Optional
from pydantic import BaseModel


class SafetyCheckResult(BaseModel):
    is_escalated: bool = False
    severity: str = "EMERGENCY"  # "EMERGENCY" | "URGENT"
    title: str = "Immediate Medical Attention Advised"
    message: str = ""
    instructions: str = ""
    red_flags: list[str] = []


def _extract_text(val: Any) -> str:
    if isinstance(val, str):
        return val
    if isinstance(val, Mapping):
        return str(val.get("value") or val.get("originalValue") or "")
    return ""


# Deterministic clinical safety patterns
SAFETY_RULES: list[dict[str, Any]] = [
    {
        "id": "cardiac_emergency",
        "name": "Acute Coronary / Cardiac Warning Signs",
        "pattern": re.compile(
            r"\b(chest\s+pain|chest\s+pressure|crushing\s+(chest\s+)?pain|tightness\s+in\s+chest|heavy\s+chest|heart\s+attack|myocardial\s+infarction)\b",
            re.IGNORECASE,
        ),
        "accompanying_pattern": re.compile(
            r"\b(left\s+arm|both\s+arms|jaw|neck|back|shoulder|sweat|sweating|clammy|short(ness)?\s+of\s+breath|breathless|nausea|vomit|dizzy|faint)\b",
            re.IGNORECASE,
        ),
        "standalone_pattern": re.compile(
            r"\b(crushing\s+chest\s+pain|chest\s+pain\s+(radiat|spread)|heart\s+attack\s+right\s+now)\b",
            re.IGNORECASE,
        ),
        "title": "Potential Cardiac Emergency",
        "message": "You reported acute chest pain/pressure with warning signs that may indicate a heart condition.",
        "instructions": (
            "Please call emergency medical services immediately (e.g. 911 in US/Canada, 112 in India/Europe, or your local emergency number), "
            "or have someone drive you to the nearest emergency room right away. Do not drive yourself."
        ),
        "severity": "EMERGENCY",
    },
    {
        "id": "stroke_emergency",
        "name": "Acute Stroke / Neurological Emergency",
        "pattern": re.compile(
            r"\b(sudden\s+weakness|sudden\s+numbness|face\s+droop|slurred\s+speech|trouble\s+speaking|cannot\s+speak|unable\s+to\s+speak|lost\s+vision|thunderclap\s+headache|worst\s+headache\s+of\s+(my\s+)?life)\b",
            re.IGNORECASE,
        ),
        "title": "Potential Neurological / Stroke Warning Sign",
        "message": "Your symptoms may indicate an acute neurological event or stroke requiring urgent hospital evaluation.",
        "instructions": (
            "Every minute counts. Seek emergency medical care immediately by calling emergency services (911 / 112) "
            "or going straight to the nearest hospital emergency department."
        ),
        "severity": "EMERGENCY",
    },
    {
        "id": "respiratory_emergency",
        "name": "Severe Respiratory Distress",
        "pattern": re.compile(
            r"\b(cannot\s+breathe|gasping\s+for\s+air|unable\s+to\s+breathe|lips\s+turning\s+blue|blue\s+lips|stridor|choking|airway\s+clos)\b",
            re.IGNORECASE,
        ),
        "title": "Severe Breathing Difficulty",
        "message": "Severe difficulty breathing is a critical medical condition that cannot wait for an online appointment.",
        "instructions": (
            "Please call emergency services (911 / 112) or proceed to the nearest emergency department immediately."
        ),
        "severity": "EMERGENCY",
    },
    {
        "id": "anaphylaxis_emergency",
        "name": "Severe Allergic Reaction (Anaphylaxis)",
        "pattern": re.compile(
            r"\b(anaphylaxis|anaphylactic|throat\s+swelling|tongue\s+swelling|throat\s+closing|swollen\s+airway)\b",
            re.IGNORECASE,
        ),
        "title": "Potential Anaphylactic Reaction",
        "message": "Symptoms of severe allergic swelling in the airway can rapidly escalate into a life-threatening emergency.",
        "instructions": (
            "If you have an epinephrine auto-injector (EpiPen), use it as directed and call emergency services (911 / 112) immediately."
        ),
        "severity": "EMERGENCY",
    },
    {
        "id": "hemorrhage_emergency",
        "name": "Acute Severe Hemorrhage",
        "pattern": re.compile(
            r"\b(coughing\s+up\s+blood|vomiting\s+blood|coffee\s+ground\s+vomit|uncontrollable\s+bleed|spurting\s+blood)\b",
            re.IGNORECASE,
        ),
        "title": "Acute Bleeding Warning Sign",
        "message": "Active bleeding or coughing/vomiting blood requires immediate clinical evaluation.",
        "instructions": (
            "Please go to the nearest emergency room or call emergency services (911 / 112) right away."
        ),
        "severity": "EMERGENCY",
    },
    {
        "id": "crisis_emergency",
        "name": "Mental Health Crisis / Self-Harm",
        "pattern": re.compile(
            r"\b(want\s+to\s+kill\s+myself|suicid(al|e)|end\s+my\s+life|hang\s+myself|shoot\s+myself)\b",
            re.IGNORECASE,
        ),
        "title": "Crisis Support Available",
        "message": "If you are feeling overwhelmed, hopeless, or having thoughts of harming yourself, compassionate help is available 24/7.",
        "instructions": (
            "Please reach out immediately: Call or text 988 (Suicide & Crisis Lifeline in US/Canada), call 112 in India, "
            "or contact your nearest hospital emergency center."
        ),
        "severity": "EMERGENCY",
    },
]


def _is_negated(match_start: int, text: str) -> bool:
    """Check if the term found at match_start is preceded within 25 characters by a negation word."""
    preceding = text[max(0, match_start - 25):match_start].lower()
    negation_patterns = [
        r"\bno\s+[\w\s]{0,10}$",
        r"\bdenies\s+[\w\s]{0,10}$",
        r"\bwithout\s+[\w\s]{0,10}$",
        r"\bnegative\s+for\s+[\w\s]{0,10}$",
        r"\bnever\s+had\s+[\w\s]{0,10}$",
        r"\bnot\s+experiencing\s+[\w\s]{0,10}$",
    ]
    return any(re.search(p, preceding) for p in negation_patterns)


def evaluate_emergency_safety(answers: Mapping[str, Any]) -> SafetyCheckResult:
    """Deterministic, zero-latency clinical red flag evaluator.
    Evaluates all patient answers against established emergency rules.
    Interrupts ordinary questioning immediately when an emergency is detected.
    """
    if not answers:
        return SafetyCheckResult(is_escalated=False)

    # Aggregate all patient text
    combined_texts = []
    for k, v in answers.items():
        text = _extract_text(v)
        if text:
            combined_texts.append(text)

    full_corpus = " \n ".join(combined_texts)

    for rule in SAFETY_RULES:
        # Check rule patterns
        triggered = False
        evidence = ""

        # Case A: standalone high-severity trigger
        standalone = rule.get("standalone_pattern")
        if standalone:
            for match in standalone.finditer(full_corpus):
                if not _is_negated(match.start(), full_corpus):
                    triggered = True
                    evidence = match.group(0)
                    break

        # Case B: primary pattern
        if not triggered:
            for primary_match in rule["pattern"].finditer(full_corpus):
                if _is_negated(primary_match.start(), full_corpus):
                    continue

                # If accompanying pattern is defined, both must match
                accompanying = rule.get("accompanying_pattern")
                if accompanying:
                    for acc_match in accompanying.finditer(full_corpus):
                        if not _is_negated(acc_match.start(), full_corpus):
                            triggered = True
                            evidence = f"{primary_match.group(0)} with {acc_match.group(0)}"
                            break
                    if triggered:
                        break
                else:
                    triggered = True
                    evidence = primary_match.group(0)
                    break

        if triggered:
            return SafetyCheckResult(
                is_escalated=True,
                severity=rule["severity"],
                title=rule["title"],
                message=rule["message"],
                instructions=rule["instructions"],
                red_flags=[f"{rule['name']}: '{evidence}'"],
            )

    return SafetyCheckResult(is_escalated=False)
