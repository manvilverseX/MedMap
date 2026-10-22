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
import re
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional, Any

from groq import Groq, RateLimitError, APITimeoutError, APIConnectionError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.core.languages import normalize_language, LANG_NAME, normalise_lang


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


from pathlib import Path

# ── Static Curated Bank ───────────────────────────────────────────────────────

_STATIC_BANK: Optional[dict[str, dict[str, str]]] = None
_REVERSE_STATIC_BANK: Optional[dict[str, dict[str, str]]] = None


def _load_static_bank() -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    global _STATIC_BANK, _REVERSE_STATIC_BANK
    if _STATIC_BANK is not None and _REVERSE_STATIC_BANK is not None:
        return _STATIC_BANK, _REVERSE_STATIC_BANK

    bank: dict[str, dict[str, str]] = {}
    reverse_bank: dict[str, dict[str, str]] = {"hi": {}, "kn": {}}

    bank_path = Path(__file__).resolve().parent.parent / "data" / "curated_translations_hi_kn.json"
    if bank_path.exists():
        try:
            with open(bank_path, "r", encoding="utf-8") as f:
                bank = json.load(f)
            for en_text, lang_map in bank.items():
                if isinstance(lang_map, dict):
                    for lang, trans_text in lang_map.items():
                        if trans_text and lang in reverse_bank:
                            reverse_bank[lang][trans_text.strip().lower()] = en_text
        except Exception as exc:
            logger.warning("Failed to load curated translations bank: %s", exc)

    _STATIC_BANK = bank
    _REVERSE_STATIC_BANK = reverse_bank
    return _STATIC_BANK, _REVERSE_STATIC_BANK


def _lookup_static_bank(text: str, target_lang: str) -> Optional[str]:
    bank, _ = _load_static_bank()
    entry = bank.get(text.strip())
    if entry and isinstance(entry, dict):
        val = entry.get(target_lang)
        if val and val.strip():
            return val.strip()
    return None


def _lookup_reverse_static_bank(text: str, source_lang: str) -> Optional[str]:
    _, reverse_bank = _load_static_bank()
    lang_map = reverse_bank.get(source_lang, {})
    return lang_map.get(text.strip().lower())


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
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        logger.debug("DB translation cache read failed (transaction rolled back): %s", exc)
        return None


def _db_set(db: Session, text_hash: str, target_lang: str, translated: str) -> None:
    try:
        from app.models.translation_cache import TranslationCache
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
        try:
            db.rollback()
        except Exception:
            pass
        logger.debug("DB translation cache write failed (transaction rolled back): %s", exc)


# ── Groq translation call ─────────────────────────────────────────────────────


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


def _call_groq_single_chunk(
    texts: list[str],
    source_lang: str,
    target_lang: str,
    timeout: float = 8.0,
    can_split: bool = True,
) -> list[str]:
    """Call Groq API to translate a single chunk (<=40 strings). Retries with split on JSON failure."""
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

    call_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 4096,
        "temperature": 0.1,
        "timeout": timeout,
    }
    if "gpt-oss" in model.lower():
        call_kwargs["reasoning_effort"] = "low"

    max_retries = 2
    last_exc = None

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(**call_kwargs)
            raw = (response.choices[0].message.content or "").strip()

            # Extract JSON array from markdown code fences or surrounding text
            if "```" in raw:
                parts = raw.split("```")
                if len(parts) >= 3:
                    block = parts[1]
                    if block.startswith("json"):
                        block = block[4:]
                    raw = block.strip()

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

        except (RateLimitError, APITimeoutError, APIConnectionError) as exc:
            last_exc = exc
            if attempt == max_retries - 1:
                break
            sleep_time = 0.5 * (2 ** attempt)
            logger.info("Groq retry attempt %d/%d (%.2fs): %s", attempt + 1, max_retries, sleep_time, exc)
            time.sleep(sleep_time)

        except json.JSONDecodeError as exc:
            last_exc = exc
            # If the chunk was more than 1 string, split in half and retry each half once
            if can_split and len(texts) > 1:
                logger.info(
                    "Groq reply truncated or malformed JSON for %d items (%s); splitting chunk in half",
                    len(texts),
                    exc,
                )
                mid = len(texts) // 2
                first_half = _call_groq_single_chunk(
                    texts[:mid], source_lang, target_lang, timeout=timeout, can_split=False
                )
                second_half = _call_groq_single_chunk(
                    texts[mid:], source_lang, target_lang, timeout=timeout, can_split=False
                )
                return first_half + second_half
            else:
                if attempt == max_retries - 1:
                    break
                time.sleep(0.5)

        except ValueError as exc:
            last_exc = exc
            if attempt == max_retries - 1:
                break
            time.sleep(0.5)

    if last_exc:
        raise last_exc
    raise RuntimeError("Translation failed without exception")


def _call_groq_translate(
    texts: list[str], source_lang: str, target_lang: str
) -> tuple[list[str], bool]:
    """Call Groq API to translate a list of texts, chunking into batches of at most 40 strings.
    Never drops the whole payload if one chunk fails: failed chunks fall back to original text.
    Returns (all_translated, at_least_one_chunk_succeeded_or_empty).
    """
    if not texts:
        return [], True

    CHUNK_SIZE = 40
    all_translated: list[str] = []
    chunk_failures = 0
    total_chunks = (len(texts) + CHUNK_SIZE - 1) // CHUNK_SIZE

    for i in range(0, len(texts), CHUNK_SIZE):
        chunk = texts[i : i + CHUNK_SIZE]
        try:
            chunk_translated = _call_groq_single_chunk(chunk, source_lang, target_lang)
            all_translated.extend(chunk_translated)
        except Exception as exc:
            chunk_failures += 1
            logger.warning(
                "Chunk %d/%d (%d texts) failed Groq translation: %s. Using original texts for this chunk.",
                (i // CHUNK_SIZE) + 1,
                total_chunks,
                len(chunk),
                exc,
            )
            all_translated.extend(chunk)

    all_failed = (chunk_failures == total_chunks)
    return all_translated, not all_failed


# ── Public API ────────────────────────────────────────────────────────────────

__all__ = ["normalize_language", "normalise_lang", "translate_texts", "translate_to_english", "translate_text"]


def translate_texts(
    texts: list[str],
    target_lang: str,
    *,
    context: str = "patient_intake",
    db: Optional[Session] = None,
) -> tuple[list[str], bool]:
    """
    Translate a list of English strings into target_lang.
    Uses static dictionary first, then LRU cache, then DB cache, then Groq (chunked).

    Returns:
        (translated_list, was_translated)
        was_translated=False means Groq was unavailable; originals are returned.
    """
    t_start = time.perf_counter()
    target_lang = normalise_lang(target_lang)
    if target_lang == "en" or not texts:
        return texts, True

    results: list[Optional[str]] = [None] * len(texts)
    uncached_indices: list[int] = []
    uncached_texts: list[str] = []

    # --- Phase 1: check (1) static bank, (2) LRU, (3) DB cache ---
    for i, text in enumerate(texts):
        if not text or not text.strip():
            results[i] = text
            continue

        clean_text = text.strip()

        # 1. Static curated bank
        static_val = _lookup_static_bank(clean_text, target_lang)
        if static_val is not None:
            results[i] = static_val
            continue

        # 2. In-memory LRU cache
        h = _text_hash(text)
        cached = _lru_get((h, target_lang))
        if cached is not None:
            results[i] = cached
            continue

        # 3. DB cache
        if db:
            db_cached = _db_get(db, h, target_lang)
            if db_cached is not None:
                _lru_set((h, target_lang), db_cached)
                results[i] = db_cached
                continue

        uncached_indices.append(i)
        uncached_texts.append(text)

    from_cache_count = len(texts) - len(uncached_texts)

    if not uncached_texts:
        t_elapsed = time.perf_counter() - t_start
        logger.info("[TIMING] translate_texts took %.4fs (100%% cached, %d items)", t_elapsed, len(texts))
        return [r if r is not None else "" for r in results], True

    # --- Phase 2: call Groq for uncached strings (chunked & split-resilient) ---
    try:
        translated_batch, ok = _call_groq_translate(uncached_texts, "en", target_lang)
        for idx, (orig_i, translated) in enumerate(zip(uncached_indices, translated_batch)):
            results[orig_i] = translated
            if ok and translated != uncached_texts[idx]:
                h = _text_hash(uncached_texts[idx])
                _lru_set((h, target_lang), translated)
                if db:
                    _db_set(db, h, target_lang, translated)
        t_elapsed = time.perf_counter() - t_start
        logger.info(
            "[TIMING] translate_texts took %.3fs for %d items (%d cached, %d via Groq, ok=%s)",
            t_elapsed,
            len(texts),
            from_cache_count,
            len(uncached_texts),
            ok,
        )
        return [r if r is not None else "" for r in results], ok

    except Exception as exc:
        t_elapsed = time.perf_counter() - t_start
        logger.warning(
            "[TIMING] Translation to '%s' failed after %.3fs (%s). Returning English originals.",
            target_lang,
            t_elapsed,
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
    t_start = time.perf_counter()
    source_lang = normalise_lang(source_lang)
    if source_lang == "en" or not text or not text.strip():
        return text, True

    clean_text = text.strip()

    # 1. Reverse lookup in static curated bank
    static_rev = _lookup_reverse_static_bank(clean_text, source_lang)
    if static_rev is not None:
        t_elapsed = time.perf_counter() - t_start
        logger.info("[TIMING] translate_to_english (Static bank) took %.4fs", t_elapsed)
        return static_rev, True

    # 2. Check LRU cache (use "en" as target_lang key)
    h = _text_hash(text)
    cached = _lru_get((h, "en_from_" + source_lang))
    if cached is not None:
        t_elapsed = time.perf_counter() - t_start
        logger.info("[TIMING] translate_to_english (LRU cache) took %.4fs", t_elapsed)
        return cached, True

    # 3. DB cache
    if db:
        db_cached = _db_get(db, h + "_from_" + source_lang, "en")
        if db_cached is not None:
            _lru_set((h, "en_from_" + source_lang), db_cached)
            t_elapsed = time.perf_counter() - t_start
            logger.info("[TIMING] translate_to_english (DB cache) took %.4fs", t_elapsed)
            return db_cached, True

    # 4. Live Groq call with timeout
    try:
        translated_list = _call_groq_single_chunk([text], source_lang, "en", timeout=5.0)
        english = translated_list[0]
        _lru_set((h, "en_from_" + source_lang), english)
        if db:
            _db_set(db, h + "_from_" + source_lang, "en", english)
        t_elapsed = time.perf_counter() - t_start
        logger.info("[TIMING] translate_to_english (Groq) took %.3fs", t_elapsed)
        return english, True
    except Exception as exc:
        t_elapsed = time.perf_counter() - t_start
        logger.warning(
            "[TIMING] to-English translation from '%s' failed after %.3fs (%s). Returning original.",
            source_lang,
            t_elapsed,
            exc,
        )
        return text, False
