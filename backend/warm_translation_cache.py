#!/usr/bin/env python3
"""
Pre-translate curated questions, options, helper texts, UI strings, and backend messages
into Hindi ('hi') and Kannada ('kn'), storing them in the persistent translation_cache database table.

Features:
- Idempotent: checks DB translation_cache table first and skips existing entries.
- Seeds static dictionary pairs from strings.ts directly into translation_cache.
- Batched requests to keep token usage within Groq limits for dynamic strings.
- Backoff and retry on HTTP 429 and timeouts (via translation_service).
- Clear progress reporting and final cached/failed metrics.
- Works with any DATABASE_URL (local or production).
- Never prints API keys or credentials.
"""

import os
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Set, Tuple

from dotenv import load_dotenv

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

load_dotenv(backend_dir / ".env")
load_dotenv()  # also load root .env if present

from app.core.database import SessionLocal
from app.models.translation_cache import TranslationCache
from app.services.translation_service import (
    translate_texts,
    _text_hash,
    _db_set,
    normalise_lang,
)
from app.services.adaptive_intake import INTAKE_QUESTIONS
from app.services.interview_engine.policy_engine import CURATED_GAP_QUESTIONS
from app.services.interview_engine.ayush_questions import AYUSH_QUESTIONS


import json


def parse_dictionaries() -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """Extract EN, HI, and KN key-value pairs from backend static bank or src/i18n/strings.ts."""
    bank_path = backend_dir / "app" / "data" / "curated_translations_hi_kn.json"
    if bank_path.exists():
        try:
            bank = json.loads(bank_path.read_text(encoding="utf-8"))
            en_dict = {f"k_{i}": en_text for i, en_text in enumerate(bank.keys())}
            hi_dict = {f"k_{i}": trans.get("hi", "") for i, trans in enumerate(bank.values())}
            kn_dict = {f"k_{i}": trans.get("kn", "") for i, trans in enumerate(bank.values())}
            return en_dict, hi_dict, kn_dict
        except Exception as e:
            print(f"[WARN] Failed to load static bank in warm script: {e}")

    candidates = [
        backend_dir.parent / "src" / "i18n" / "strings.ts",
        Path("src/i18n/strings.ts"),
    ]
    for p in candidates:
        if p.exists():
            try:
                content = p.read_text(encoding="utf-8")
                dicts = {}
                for name in ["EN_STRINGS", "HI_STRINGS", "KN_STRINGS"]:
                    # Match object block: export const NAME ... = { ... }
                    match = re.search(rf"export const {name}[^=]*=\s*\{{(.*?)\}}\s*(?:as\s+const|satisfies[^;]*)?;", content, re.DOTALL)
                    if match:
                        block = match.group(1)
                        items = {}
                        for m in re.finditer(r'([a-zA-Z0-9_]+)\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\')', block):
                            k = m.group(1)
                            v = m.group(2) if m.group(2) is not None else m.group(3)
                            items[k] = v
                        dicts[name] = items
                if len(dicts) == 3:
                    return dicts["EN_STRINGS"], dicts["HI_STRINGS"], dicts["KN_STRINGS"]
            except Exception as e:
                print(f"[WARN] Failed to parse strings.ts: {e}")
                break

    return {}, {}, {}


def collect_all_translatable_strings(en_dict: Dict[str, str]) -> List[str]:
    """Collect all unique curated prompts, categories, helper texts, options, UI strings, and backend messages."""
    string_set: Set[str] = set()

    # 1. Standard curated intake questions
    for q in INTAKE_QUESTIONS:
        if q.category and q.category.strip():
            string_set.add(q.category.strip())
        if q.prompt and q.prompt.strip():
            string_set.add(q.prompt.strip())
        if q.helperText and q.helperText.strip():
            string_set.add(q.helperText.strip())
        for opt in (q.options or ()):
            if opt and opt.strip():
                string_set.add(opt.strip())
        for c_opt in (q.clarificationOptions or ()):
            if c_opt and c_opt.strip():
                string_set.add(c_opt.strip())

    # 2. Curated gap questions (policy engine)
    for q_data in CURATED_GAP_QUESTIONS.values():
        cat = q_data.get("category")
        if cat and str(cat).strip():
            string_set.add(str(cat).strip())
        prompt = q_data.get("prompt")
        if prompt and str(prompt).strip():
            string_set.add(str(prompt).strip())
        helper = q_data.get("helperText") or q_data.get("helper_text")
        if helper and str(helper).strip():
            string_set.add(str(helper).strip())
        for opt in q_data.get("options", ()):
            if opt and str(opt).strip():
                string_set.add(str(opt).strip())

    # 3. AYUSH / Ayurveda curated questions
    for q in AYUSH_QUESTIONS:
        if q.category and q.category.strip():
            string_set.add(q.category.strip())
        if q.prompt and q.prompt.strip():
            string_set.add(q.prompt.strip())
        if q.helperText and q.helperText.strip():
            string_set.add(q.helperText.strip())
        for opt in (q.options or ()):
            if opt and opt.strip():
                string_set.add(opt.strip())

    # 4. All UI dictionary strings
    for s in en_dict.values():
        if s and s.strip():
            string_set.add(s.strip())

    # 5. Backend-originated errors, notices, and categories
    backend_patient_strings = [
        "Immediate Medical Attention Advised",
        "Immediate Medical Attention Recommended",
        "Symptoms of Clinical Concern:",
        "Recommended Action",
        "Invalid input. Please check your answers.",
        "Too many requests. Please wait a moment.",
        "Your session has expired. Please start again.",
        "Case not found.",
        "Failed to create case. Please try again.",
        "Failed to load case. Please try again.",
        "Upload failed. Please check the file and try again.",
        "File too large",
        "File size exceeds 10MB limit.",
        "Unsupported file format",
        "Please upload a PDF or image file (PNG, JPG, WebP).",
        "Speech service is temporarily unavailable.",
        "Translation service is temporarily unavailable.",
        "Network error. Please check your connection.",
        "Patient consent is required",
        "Invalid state transition",
        "Failed to load question. Please try again.",
        "Failed to save your answers. Please try again.",
        "Failed to navigate to previous question.",
        "Failed to load question for correction.",
        "The saved answer needs clarification",
        "Could you clarify?",
        "I'm not sure / Unknown",
        "Yes",
        "No",
        "Not sure",
        "Skipped",
        "Uncertain",
        "Please describe your primary concern in a few words.",
        "Review of Systems",
        "History of Present Illness",
        "Past Medical History",
        "Medications & Allergies",
        "Family History",
        "Social & Environmental History",
        "Ayurveda / AYUSH Pathway",
        "Dashavidha Pariksha",
        "Prakriti Assessment",
    ]
    for s in backend_patient_strings:
        string_set.add(s.strip())

    cleaned = sorted(list({s for s in string_set if s and s.strip()}))
    return cleaned


def seed_static_translations(db, en_dict: Dict[str, str], target_dict: Dict[str, str], target_lang: str) -> int:
    """Pre-seed known static translations into translation_cache table if missing."""
    norm_lang = normalise_lang(target_lang)
    seeded_count = 0
    for key, en_text in en_dict.items():
        if not en_text:
            continue
        target_text = target_dict.get(key)
        if target_text and target_text.strip():
            h = _text_hash(en_text.strip())
            # Check if exists
            row = (
                db.query(TranslationCache.source_text_hash)
                .filter_by(source_text_hash=h, target_lang=norm_lang)
                .first()
            )
            if not row:
                _db_set(db, h, norm_lang, target_text.strip())
                seeded_count += 1
    return seeded_count


def warm_cache_for_language(
    db,
    strings: List[str],
    target_lang: str,
    en_dict: Dict[str, str],
    target_dict: Dict[str, str],
    batch_size: int = 12,
):
    """Warm translation cache for a specific target language in idempotent batches."""
    norm_lang = normalise_lang(target_lang)
    print(f"\n========================================================")
    print(f" Warming translation cache for: {norm_lang.upper()} ({target_lang})")
    print(f"========================================================")

    # 1. First seed static dictionary translations
    seeded = seed_static_translations(db, en_dict, target_dict, norm_lang)
    if seeded > 0:
        print(f"Pre-seeded from dictionary: {seeded} translations")

    # 2. Identify already cached strings
    existing_hashes = {
        row[0]
        for row in db.query(TranslationCache.source_text_hash)
        .filter(TranslationCache.target_lang == norm_lang)
        .all()
    }

    already_cached: List[str] = []
    to_translate: List[str] = []

    for s in strings:
        h = _text_hash(s)
        if h in existing_hashes:
            already_cached.append(s)
        else:
            to_translate.append(s)

    print(f"Total strings discovered: {len(strings)}")
    print(f"Already cached in DB:     {len(already_cached)}")
    print(f"Remaining to translate:   {len(to_translate)}")

    if not to_translate:
        print(f"All strings already cached for {norm_lang.upper()}! No API calls needed.")
        return len(already_cached), 0, 0

    has_groq = bool(os.getenv("GROQ_API_KEY"))
    if not has_groq:
        print(f"[NOTE] GROQ_API_KEY not set. Kept {len(already_cached)} pre-cached entries in DB.")
        return len(already_cached), 0, len(to_translate)

    # 3. Batch and translate remaining strings
    batches = [to_translate[i : i + batch_size] for i in range(0, len(to_translate), batch_size)]
    total_batches = len(batches)
    newly_cached = 0
    failed_count = 0

    for idx, batch in enumerate(batches, start=1):
        print(f"[{norm_lang.upper()}] Translating batch {idx}/{total_batches} ({len(batch)} strings)...", end=" ", flush=True)
        try:
            translated, was_translated = translate_texts(batch, norm_lang, db=db)
            if was_translated:
                newly_cached += len(batch)
                print(f"OK ({len(batch)} cached)")
            else:
                failed_count += len(batch)
                print(f"FAILED (fallback occurred)")
        except Exception as exc:
            failed_count += len(batch)
            print(f"ERROR ({exc})")

        # Polite delay between batches to stay well within Groq TPM limit
        if idx < total_batches:
            time.sleep(1.2)

    return len(already_cached), newly_cached, failed_count


def main():
    print("MedMap Translation Cache Warmer")
    print("--------------------------------")

    en_dict, hi_dict, kn_dict = parse_dictionaries()
    print(f"Parsed strings.ts: {len(en_dict)} EN keys, {len(hi_dict)} HI keys, {len(kn_dict)} KN keys.")

    all_strings = collect_all_translatable_strings(en_dict)
    print(f"Discovered {len(all_strings)} unique translatable curated, UI & backend strings.")

    db = SessionLocal()
    summary = {}

    try:
        targets = [
            ("hi", hi_dict),
            ("kn", kn_dict),
        ]
        for lang_code, target_dict in targets:
            already, new_count, failed = warm_cache_for_language(
                db, all_strings, lang_code, en_dict, target_dict, batch_size=12
            )
            summary[lang_code] = {
                "already_cached": already,
                "newly_cached": new_count,
                "total_cached": already + new_count,
                "failed": failed,
            }

        print("\n========================================================")
        print(" FINAL TRANSLATION CACHE SUMMARY")
        print("========================================================")
        for lang, stats in summary.items():
            print(
                f"[{lang.upper()}] Total in DB: {stats['total_cached']:4d} | "
                f"Pre-existing: {stats['already_cached']:4d} | "
                f"Newly Added: {stats['newly_cached']:4d} | "
                f"Failed: {stats['failed']:4d}"
            )
        print("========================================================\n")

    finally:
        db.close()


if __name__ == "__main__":
    main()
