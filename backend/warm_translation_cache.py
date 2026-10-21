#!/usr/bin/env python3
"""
Pre-translate curated questions, options, helper texts, and UI strings into Hindi ('hi')
and Kannada ('kn'), storing them in the persistent translation_cache database table.

Features:
- Idempotent: checks DB translation_cache table first and skips existing entries.
- Batched requests to keep token usage within Groq limits.
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
from typing import List, Set

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
    normalise_lang,
)
from app.services.adaptive_intake import INTAKE_QUESTIONS
from app.services.interview_engine.policy_engine import CURATED_GAP_QUESTIONS
from app.services.interview_engine.ayush_questions import AYUSH_QUESTIONS


def extract_ui_strings() -> List[str]:
    """Extract English UI strings from src/i18n/strings.ts if accessible, or fallback list."""
    candidates = [
        backend_dir.parent / "src" / "i18n" / "strings.ts",
        Path("src/i18n/strings.ts"),
    ]
    for p in candidates:
        if p.exists():
            try:
                content = p.read_text(encoding="utf-8")
                match = re.search(r"export const EN_STRINGS\s*=\s*\{(.*?)\};", content, re.DOTALL)
                if match:
                    block = match.group(1)
                    # Extract string literals after property names
                    found = re.findall(r':\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\')', block)
                    extracted = [m[0] or m[1] for m in found if (m[0] or m[1])]
                    if extracted:
                        return extracted
            except Exception as e:
                print(f"[WARN] Failed to parse strings.ts: {e}")
                break

    # Fallback core UI strings if strings.ts cannot be read
    return [
        "MedMap",
        "AI Pre-Consultation Case-Taking",
        "Start Patient Intake",
        "Doctor Clinical Review",
        "Hospital Admin Triage",
        "AI assists, your doctor decides. AI does not produce diagnoses.",
        "Welcome to MedMap",
        "Please enter your details to start.",
        "Patient ID",
        "Preferred Language",
        "Consultation Type",
        "General Clinical History",
        "AYUSH / Ayurveda History",
        "Start Intake",
        "Patient Intake",
        "Voice & Audio Mode",
        "Skip this question",
        "Save & Continue",
        "Finish Intake",
        "Read Aloud",
        "Stop",
        "Audio is unavailable right now. Please read the question on screen.",
        "Tap to Speak",
        "Try again",
        "Failed to load question. Please try again.",
        "Failed to save your answers. Please try again.",
        "Confirm & Continue to Documents",
        "Review Your Medical History",
    ]


def collect_all_translatable_strings() -> List[str]:
    """Collect all unique curated prompts, categories, helper texts, options, and UI strings."""
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

    # 4. System & UI strings
    for ui_str in extract_ui_strings():
        if ui_str and ui_str.strip():
            string_set.add(ui_str.strip())

    # 5. Common intake state and clarification notices
    auxiliary_strings = [
        "The saved answer needs clarification",
        "Could you clarify?",
        "I'm not sure / Unknown",
        "Yes",
        "No",
        "Not sure",
        "Skipped",
        "Uncertain",
        "Please describe your primary concern in a few words.",
    ]
    for s in auxiliary_strings:
        string_set.add(s)

    # Filter out empty or whitespace-only
    cleaned = sorted(list({s for s in string_set if s and s.strip()}))
    return cleaned


def warm_cache_for_language(db, strings: List[str], target_lang: str, batch_size: int = 12):
    """Warm translation cache for a specific target language in idempotent batches."""
    norm_lang = normalise_lang(target_lang)
    print(f"\n========================================================")
    print(f" Warming translation cache for: {norm_lang.upper()} ({target_lang})")
    print(f"========================================================")

    # 1. Identify already cached strings
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

    # 2. Batch and translate remaining strings
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

    # Safety check on API key
    if not os.getenv("GROQ_API_KEY"):
        print("[ERROR] GROQ_API_KEY environment variable is not set. Aborting.")
        sys.exit(1)

    all_strings = collect_all_translatable_strings()
    print(f"Discovered {len(all_strings)} unique translatable curated & UI strings.")

    db = SessionLocal()
    summary = {}

    try:
        for lang in ["hi", "kn"]:
            already, new_count, failed = warm_cache_for_language(db, all_strings, lang, batch_size=12)
            summary[lang] = {
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
