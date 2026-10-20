"""
Translation service for MedMap.

Design principles
─────────────────
* English is the canonical clinical language.  Only display text is ever translated.
* Translations are fetched from Groq (llama) with a strict prompt.
* Each unique (source_text_hash, target_lang) pair is cached:
    1. In-memory LRU (fast, process-lifetime)
    2. DB table `translation_cache` (persistent across restarts)
* If Groq is unavailable, the original English text is returned with
  `translated=False` so callers can show a fallback notice.
* Translation prompts are faithful-only: numbers, doses, drug names unchanged.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional

from groq import Groq
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Language code normalisation ───────────────────────────────────────────────

LANG_NAME = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
LANG_CODE = {
    "english": "en",
    "hindi": "hi",
    "kannada": "kn",
    "en": "en",
    "hi": "hi",
    "kn": "kn",
}

# Fallback notice shown in the patient's language when translation unavailable.
FALLBACK_NOTICE = {
    "hi": "अनुवाद उपलब्ध नहीं है, अंग्रेज़ी में दिखाया जा रहा है।",
    "kn": "ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ, ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ.",
}

AI_TRANSLATION_TAG = {
    "hi": "AI अनुवाद, त्रुटि हो सकती है।",
    "kn": "AI ಅನುವಾದ, ದೋಷಗಳಿರಬಹುದು.",
    "en": "AI translation, may contain errors.",
}

# ── In-memory LRU ─────────────────────────────────────────────────────────────

_LRU_MAX = 2048
_lru_cache: OrderedDict[tuple[str, str], str] = OrderedDict()


def _lru_get(key: tuple[str, str]) -> Optional[str]:
    if key in _lru_cache:
        _lru_cache.move_to_end(key)
        return _lru_cache[key]
    return None


def _lru_set(key: tuple[str, str], value: str) -> None:
    if key in _lru_cache:
        _lru_cache.move_to_end(key)
    else:
        if len(_lru_cache) >= _LRU_MAX:
            _lru_cache.popitem(last=False)
    _lru_cache[key] = value


# ── Hash helper ───────────────────────────────────────────────────────────────

def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


# ── DB cache helpers ──────────────────────────────────────────────────────────

def _db_get(db: Session, text_hash: str, target_lang: str) -> Optional[str]:
    try:
        from app.models.translation_cache import TranslationCache  # local import to avoid circular
        row = (
            db.query(TranslationCache)
            .filter_by(source_text_hash=text_hash, target_lang=target_lang)
            .first()
        )
        return row.translated_text if row else None
    except Exception:
        return None


def _db_set(db: Session, text_hash: str, target_lang: str, translated: str) -> None:
    try:
        from app.models.translation_cache import TranslationCache
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        row = (
            db.query(TranslationCache)
            .filter_by(source_text_hash=text_hash, target_lang=target_lang)
            .first()
        )
        if row:
            row.translated_text = translated
            row.created_at = datetime.now(timezone.utc)
        else:
            row = TranslationCache(
                source_text_hash=text_hash,
                target_lang=target_lang,
                translated_text=translated,
                created_at=datetime.now(timezone.utc),
            )
            db.add(row)
        db.commit()
    except Exception as exc:
        logger.debug("DB translation cache write failed: %s", exc)


# ── Groq translation call ─────────────────────────────────────────────────────

_TRANSLATION_PROMPT = """You are a certified medical interpreter. Translate the following list of strings from {source_lang} into {target_lang}.

Rules (non-negotiable):
1. Translate faithfully. Do NOT add, remove, or interpret any medical information.
2. Keep all drug names, doses, numbers, units, and medical terms unchanged.
3. Use simple, everyday words patients understand.
4. Return ONLY a valid JSON array of strings, same length and same order as the input.
5. Do NOT wrap in markdown code blocks.
6. Kannada output must use Kannada script. Hindi output must use Devanagari script.

Input strings:
{input_json}"""


def _call_groq_translate(texts: list[str], source_lang: str, target_lang: str) -> list[str]:
    """Call Groq API to translate a batch of texts. Returns translated list or raises."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    client = Groq(api_key=api_key)

    src_name = LANG_NAME.get(source_lang, "English")
    tgt_name = LANG_NAME.get(target_lang, target_lang)
    prompt = _TRANSLATION_PROMPT.format(
        source_lang=src_name,
        target_lang=tgt_name,
        input_json=json.dumps(texts, ensure_ascii=False),
    )

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        timeout=20.0,
    )
    raw = (response.choices[0].message.content or "").strip()

    # Extract JSON array from markdown code fences or surrounding text
    if "```" in raw:
        parts = raw.split("```")
        if len(parts) >= 3:
            block = parts[1]
            if block.startswith("json"):
                block = block[4:]
            raw = block.strip()

    # Extract bracketed JSON array if model included thoughts/preamble
    start_bracket = raw.find("[")
    end_bracket = raw.rfind("]")
    if start_bracket != -1 and end_bracket != -1 and end_bracket > start_bracket:
        raw = raw[start_bracket : end_bracket + 1]

    result = json.loads(raw)

    if not isinstance(result, list):
        raise ValueError("Translation response was not a JSON array")
    if len(result) != len(texts):
        raise ValueError(
            f"Translation length mismatch: expected {len(texts)}, got {len(result)}"
        )
    return [str(t) for t in result]



# ── Public API ────────────────────────────────────────────────────────────────

def normalise_lang(lang: Optional[str]) -> str:
    """Map 'English'/'Hindi'/'Kannada' or 'en'/'hi'/'kn' to lowercase 2-char code."""
    if not lang:
        return "en"
    return LANG_CODE.get(lang.lower(), "en")


def translate_texts(
    texts: list[str],
    target_lang: str,
    *,
    context: str = "patient_intake",
    db: Optional[Session] = None,
) -> tuple[list[str], bool]:
    """
    Translate a list of English strings into target_lang.

    Returns:
        (translated_list, was_translated)
        was_translated=False means Groq was unavailable; originals are returned.
    """
    target_lang = normalise_lang(target_lang)
    if target_lang == "en" or not texts:
        return texts, True  # Nothing to do

    results: list[Optional[str]] = [None] * len(texts)
    uncached_indices: list[int] = []
    uncached_texts: list[str] = []

    # --- Phase 1: check both caches ---
    for i, text in enumerate(texts):
        if not text or not text.strip():
            results[i] = text
            continue
        h = _text_hash(text)
        cached = _lru_get((h, target_lang))
        if cached is not None:
            results[i] = cached
            continue
        if db:
            db_cached = _db_get(db, h, target_lang)
            if db_cached is not None:
                _lru_set((h, target_lang), db_cached)
                results[i] = db_cached
                continue
        uncached_indices.append(i)
        uncached_texts.append(text)

    if not uncached_texts:
        return [r if r is not None else "" for r in results], True

    # --- Phase 2: call Groq for uncached strings ---
    try:
        translated_batch = _call_groq_translate(uncached_texts, "en", target_lang)
        for idx, (orig_i, translated) in enumerate(zip(uncached_indices, translated_batch)):
            results[orig_i] = translated
            h = _text_hash(uncached_texts[idx])
            _lru_set((h, target_lang), translated)
            if db:
                _db_set(db, h, target_lang, translated)
        return [r if r is not None else "" for r in results], True

    except Exception as exc:
        logger.warning(
            "Translation to '%s' failed (%s). Returning English originals.",
            target_lang,
            exc,
        )
        for i in uncached_indices:
            results[i] = texts[i]
        return [r if r is not None else "" for r in results], False


def translate_to_english(
    text: str,
    source_lang: str,
    *,
    db: Optional[Session] = None,
) -> tuple[str, bool]:
    """
    Translate a patient's free-text answer from source_lang into English.

    Returns:
        (english_text, was_translated)
        was_translated=False means Groq was unavailable; original text returned.
    """
    source_lang = normalise_lang(source_lang)
    if source_lang == "en" or not text or not text.strip():
        return text, True

    # Check cache (use "en" as target_lang key)
    h = _text_hash(text)
    cached = _lru_get((h, "en_from_" + source_lang))
    if cached is not None:
        return cached, True
    if db:
        db_cached = _db_get(db, h + "_from_" + source_lang, "en")
        if db_cached is not None:
            _lru_set((h, "en_from_" + source_lang), db_cached)
            return db_cached, True

    try:
        translated_list = _call_groq_translate([text], source_lang, "en")
        english = translated_list[0]
        _lru_set((h, "en_from_" + source_lang), english)
        if db:
            _db_set(db, h + "_from_" + source_lang, "en", english)
        return english, True
    except Exception as exc:
        logger.warning(
            "to-English translation from '%s' failed (%s). Returning original.",
            source_lang,
            exc,
        )
        return text, False
