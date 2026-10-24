"""
Language-aware negative ("none") answer recognition, normalization, and canonical mapping.
Strict answer validity: accepts "none" ONLY for questions where allowsNone is True,
preserving canonical English clinical values and rejecting gibberish.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional


# Question allowsNone mapping
# True: Questions where "none" is a clinically valid, meaningful response.
# False: Questions that require specific description (chief complaint, onset, timing, severity).
ALLOWS_NONE_MAP: dict[str, bool] = {
    # HPI & Symptoms
    "hpi_associated": True,
    "hpi_radiation": True,
    "hpi_triggers": True,
    "chief_complaint": False,
    "hpi_timing": False,
    "present_illness": False,
    "hpi_character": False,
    "hpi_severity": False,
    "duration": False,
    # Medical & Surgical History
    "medications": True,
    "allergies": True,
    "allergy_reaction": True,
    "past_medical": True,
    "past_surgical": True,
    "family_history": True,
    "review_of_systems": True,
    "previous_investigations": True,
    "other_history": True,
    # Personal & Lifestyle History
    "personal_habits": True,
    "personal_diet": False,
    "personal_sleep": False,
    "personal_occupation": False,
    # AYUSH Pathway
    "ayush_prakriti": False,
    "ayush_vikriti": False,
    "ayush_sara": False,
    "ayush_samhanana": False,
    "ayush_pramana": False,
    "ayush_satmya": False,
    "ayush_sattva": False,
    "ayush_ahara_shakti": False,
    "ayush_vyayama_shakti": False,
    "ayush_vaya": False,
    "ayush_agni": False,
    "ayush_koshtha": False,
    "ayush_ahara_vihara": False,
    "ayush_nidana": False,
    "ayush_samprapti": False,
}

CANONICAL_NONE_VALUES: dict[str, str] = {
    "hpi_associated": "No other associated symptoms",
    "hpi_radiation": "Stays in one localized area",
    "hpi_triggers": "Nothing seems to change it",
    "medications": "No current medications",
    "allergies": "No known allergies",
    "allergy_reaction": "None reported",
    "past_medical": "No prior medical conditions",
    "past_surgical": "No previous surgeries or hospitalizations",
    "family_history": "No significant family medical history",
    "review_of_systems": "No other symptoms",
    "previous_investigations": "None / not sure",
    "other_history": "Nothing else",
    "personal_habits": "None / Never used",
}


def normalize_answer(text: str) -> str:
    """Normalize answer text by Unicode normalization (NFC), removing punctuation,
    collapsing whitespace, and lowercasing."""
    if not text:
        return ""
    # 1. Unicode NFC
    nfc = unicodedata.normalize("NFC", text)
    # 2. Lowercase / casefold
    lowered = nfc.casefold()
    # 3. Replace punctuation (preserve Latin, Devanagari, and Kannada alphanumeric)
    cleaned = re.sub(r"[^\w\s\u0900-\u097F\u0C80-\u0CFF]", " ", lowered)
    # 4. Collapse multiple whitespace and trim
    return re.sub(r"\s+", " ", cleaned).strip()


# Programmatically maintained negative / none lexicon
NONE_LEXICON: set[str] = {
    # English
    "no",
    "none",
    "nothing",
    "nil",
    "na",
    "n a",
    "not applicable",
    "no symptoms",
    "no other symptoms",
    "no associated symptoms",
    "no other associated symptoms",
    "no new symptoms",
    "no additional symptoms",
    "no complaints",
    "no other complaints",
    "no issues",
    "no other issues",
    "no problems",
    "no other problems",
    "not any",
    "none reported",
    "none at all",
    "no known allergies",
    "no allergies",
    "no allergy",
    "no prior medical conditions",
    "no medical conditions",
    "no past medical history",
    "no surgeries",
    "no previous surgeries",
    "no past surgeries",
    "no surgical history",
    "no medications",
    "no current medications",
    "no daily medications",
    "no pills",
    "no family history",
    "no significant family history",
    "never used",
    "never",
    "denies",
    "negative",
    "nothing else",
    "none not sure",
    "none / not sure",
    "not sure",
    # Hindi (Devanagari)
    "कोई लक्षण नहीं",
    "कोई नहीं",
    "नहीं",
    "कुछ नहीं",
    "नहीं है",
    "कुछ और नहीं",
    "कोई नहीं / पक्का नहीं",
    "कोई नहीं / निश्चित नहीं",
    "पक्का नहीं",
    "निश्चित नहीं",
    "कोई अन्य लक्षण नहीं",
    "कोई बीमारी नहीं",
    "कोई पुरानी बीमारी नहीं",
    "कोई दवा नहीं",
    "कोई दवाई नहीं",
    "कोई एलर्जी नहीं",
    "कोई तकलीफ नहीं",
    "कोई समस्या नहीं",
    "ना",
    # Kannada
    "ಯಾವುದೇ ಲಕ್ಷಣಗಳಿಲ್ಲ",
    "ಯಾವುದೂ ಇಲ್ಲ",
    "ಇಲ್ಲ",
    "ಏನೂ ಇಲ್ಲ",
    "ಬೇರೇನೂ ಇಲ್ಲ",
    "ಯಾವುದೂ ಇಲ್ಲ / ಖಚಿತವಿಲ್ಲ",
    "ಖಚಿತವಿಲ್ಲ",
    "ಯಾವ ಲಕ್ಷಣವೂ ಇಲ್ಲ",
    "ಯಾವುದೇ ಇತರ ಲಕ್ಷಣಗಳಿಲ್ಲ",
    "ಯಾವುದೇ ಕಾಯಿಲೆ ಇಲ್ಲ",
    "ಯಾವುದೇ ಹಿಂದಿನ ಕಾಯಿಲೆಗಳಿಲ್ಲ",
    "ಯಾವುದೇ ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ ಇಲ್ಲ",
    "ಯಾವುದೇ ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ ಆಗಿಲ್ಲ",
    "ಯಾವುದೇ ಔಷಧಿ ಇಲ್ಲ",
    "ಯಾವುದೇ ಅಲರ್ಜಿ ಇಲ್ಲ",
    "ಇಲ್ಲವೇ ಇಲ್ಲ",
    # Latin Transliterations (Hinglish & Kanglish)
    "nahi",
    "nahin",
    "kuch nahi",
    "kuch nahin",
    "kuch aur nahi",
    "kuch aur nahin",
    "koi nahi",
    "koi nahin",
    "koi lakshan nahi",
    "koi lakshan nahin",
    "koi bimari nahi",
    "koi dawai nahi",
    "illa",
    "yavude illa",
    "yavudu illa",
    "berenu illa",
    "enu illa",
    "yenu illa",
    "kuch nhi",
    "koi nhi",
}

# Pre-normalized set for O(1) membership lookups
_NORMALIZED_NONE_LEXICON = {normalize_answer(item) for item in NONE_LEXICON}

# Regular expression pattern for parameterized English "no ..." answers
_EN_NONE_PATTERN = re.compile(
    r"^(no|none|nil|nothing|na|n a)(\s+(other\s+|more\s+|associated\s+|additional\s+|further\s+)?"
    r"(symptoms?|issues?|problems?|complaints?|allergies|allergy|medications?|medicines?|conditions?|surgeries|operations?|history))?$"
)


def allows_none(question_id: str) -> bool:
    """Return whether this question allows a 'none' / negative response."""
    return ALLOWS_NONE_MAP.get(question_id, False)


def is_none_answer(text: str) -> bool:
    """Check if the given text represents a recognized 'none' / negative answer."""
    norm = normalize_answer(text)
    if not norm:
        return False

    if norm in _NORMALIZED_NONE_LEXICON:
        return True

    if _EN_NONE_PATTERN.match(norm):
        return True

    return False


def get_canonical_none_value(question_id: str, original_text: Optional[str] = None) -> str:
    """Return the English canonical clinical value for a 'none' answer to this question."""
    return CANONICAL_NONE_VALUES.get(question_id, "None reported")
