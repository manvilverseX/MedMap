"""
Canonical Language Normalization for MedMap.
Supported patient intake languages:
  - English (en)
  - Hindi (hi)
  - Kannada (kn)
"""
from typing import Optional, Literal

SupportedLanguage = Literal["en", "hi", "kn"]

LANG_NAME = {
    "en": "English",
    "hi": "Hindi",
    "kn": "Kannada",
}

def normalize_language(raw: Optional[str], default: Optional[str] = "en") -> Optional[SupportedLanguage]:
    """Canonical language normalizer for MedMap backend.
    Accepts:
      - Kannada: "Kannada", "kannada", "kn", "kn-IN", "kn_IN", "ಕನ್ನಡ", "ka", etc.
      - Hindi: "Hindi", "hindi", "hi", "hi-IN", "hi_IN", "हिंदी", "हिन्दी"
      - English: "English", "english", "en", "en-IN", etc.
      - None / empty / unrecognized: returns default (default "en")
    Returns: "en" | "hi" | "kn" (or default if unrecognized)
    """
    if not raw:
        return default
    val = str(raw).strip()
    if not val:
        return default

    # Native script matches
    if "ಕನ್ನಡ" in val:
        return "kn"
    if "हिंदी" in val or "हिन्दी" in val:
        return "hi"

    lower = val.lower()

    # Kannada
    if (
        "kannada" in lower
        or lower == "kn"
        or lower.startswith("kn-")
        or lower.startswith("kn_")
        or lower == "ka"
        or lower.startswith("ka-")
        or lower.startswith("ka_")
    ):
        return "kn"

    # Hindi
    if (
        "hindi" in lower
        or lower == "hi"
        or lower.startswith("hi-")
        or lower.startswith("hi_")
    ):
        return "hi"

    # English & fallbacks
    if (
        "english" in lower
        or lower == "en"
        or lower.startswith("en-")
        or lower.startswith("en_")
    ):
        return "en"

    return default


# Alias for backwards compatibility
normalise_lang = normalize_language
normalise_speech_lang = normalize_language

