# MedMap — Multilingual Architecture & Language Status (`docs/LANGUAGE_STATUS.md`)

## Executive Summary

MedMap supports **English (`en`)**, **Hindi (`hi`)**, and **Kannada (`kn`)** across the entire pre-consultation workflow. The system bridges regional patient communication in India's official and state languages while strictly preserving clinical safety, deterministic rule processing, and international interoperability.

---

## Architectural Principles

### 1. English is the Canonical Clinical Language
- The backend state machine, clinical graph, red-flag triggers, gap detection, drug interaction checks, and FHIR R4 schema mapping operate exclusively on English clinical tokens.
- Free-text answers submitted by patients in Kannada or Hindi are translated into English on receipt and persisted as bilingual dictionaries:
  ```json
  {
    "chief_complaint": {
      "value": "High fever with chills and severe body ache for 3 days",
      "original": "ಮೂರು ದಿನಗಳಿಂದ ಚಳಿ ಮತ್ತು ತೀವ್ರ ಮೈಕೈ ನೋವಿನೊಂದಿಗೆ ತೀವ್ರ ಜ್ವರ",
      "lang": "kn"
    }
  }
  ```
- Choice questions maintain stable English identifiers (e.g. `lt_1_day`, `yes`, `no`) while rendering localized display labels (`1 ದಿನಕ್ಕಿಂತ ಕಡಿಮೆ`).

### 2. Live Translation via Groq Integration
- Translation is performed using the existing `Groq` LLM client (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`).
- No new external translation vendor or additional API key is required.
- Translation requests utilize batched JSON prompts for high throughput and reduced token usage.

### 3. Two-Tier Caching for Low Latency & High Resilience
- **Database Level (`translation_cache` table):**
  - Schema: `hash (SHA-256)`, `source_text`, `source_lang`, `target_lang`, `translated_text`, `created_at`.
  - Alembic migration: `f3a1b2c4d5e6_add_translation_cache.py`.
  - Cache hits return instantly with zero LLM latency and zero token consumption.
- **Frontend Session Level (`sessionStorage`):**
  - UI labels and static strings fetched via `POST /api/v1/translate/ui` are cached in the browser's `sessionStorage`.
  - Switching pages or re-rendering questions does not re-fetch translations.

### 4. Non-Blocking Graceful Fallback
- If Groq API rate limits are encountered (HTTP 429), the network disconnects, or `GROQ_API_KEY` is omitted:
  - Backend returns the canonical English text with `aiTranslationTag: "Translation unavailable, showing English"`.
  - Patient UI displays an informative banner (*"ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ, ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ"*).
  - The patient workflow never hangs, errors, or prevents intake submission.

---

## Speech Synthesis (TTS) & Recognition (STT)

### Language Matching & Safe Audio Fallback
- **Speech-to-Text (STT):**
  - Web Speech API `SpeechRecognition` is configured with regional BCP 47 language codes:
    - English: `en-IN`
    - Hindi: `hi-IN`
    - Kannada: `kn-IN`
  - Voice transcripts populate the editable input field and are never auto-submitted without patient review.
- **Speech Synthesis (TTS - Read Aloud):**
  - Before invoking `window.speechSynthesis.speak()`, MedMap queries `window.speechSynthesis.getVoices()` to verify that an installed voice exists for the target language (e.g. `kn` or `kn-IN`).
  - **Critical Rule:** If the user's OS or browser lacks a voice for the selected language (common for Kannada on desktop Windows/Linux), MedMap **does not speak English**. Speaking English when the patient selected Kannada causes confusion.
  - Instead, the audio button is disabled with tooltip guidance, and an accessible message is displayed:
    - Kannada: `ℹ️ ಈ ಸಾಧನದಲ್ಲಿ ಕನ್ನಡ ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಓದಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ.`
    - Hindi: `ℹ️ इस डिवाइस पर हिंदी आवाज़ उपलब्ध नहीं है। कृपया पढ़कर उत्तर दें।`

---

## Patient Verification & Doctor Inspection

### Patient Verification (`/patient/verify`)
- Summary cards display the patient's original words in their chosen language.
- Inline edits allow patients to correct errors in their native script.
- Submitting an edited response automatically re-translates into canonical English for clinical evaluation.

### Doctor Portal (`/doctor/cases/:caseId`)
- **Canonical English View (Default):**
  - Diagnoses, medications, safety red flags, and clinical summaries are presented in English.
- **Patient Language Toggle:**
  - A toggle button in the header (`English (Canonical) | Patient's Language (kn)`) switches intake answer displays between English interpretations and verbatim patient utterances.
- **🔍 Evidence Modal:**
  - Shows side-by-side evidence:
    - Canonical English Clinical Interpretation
    - Original Native Utterance
- **FHIR R4 Bundle Integrity:**
  - `Observation`, `Condition`, and `MedicationRequest` resources are generated using standard English clinical codes (SNOMED-CT / LOINC / RxNorm concepts).
  - Original native text is maintained as narrative text or annotations.

---

## Known Limitations & Environment Caveats

1. **Groq Free-Tier Rate Limits (TPD):**
   - Free-tier Groq API keys have daily token limits (typically 200k Tokens Per Day).
   - Under heavy batch test execution, rate limit exhaustion triggers fallback mode. Pre-seeded cache entries ensure continuous operation for all demo cases.
2. **Device TTS Voice Availability:**
   - Kannada voices (`kn-IN`) are natively included on Android and macOS devices, but are often missing by default on minimal desktop Windows and Linux installations.
   - The safe-mute fallback handles this gracefully without user confusion.
3. **Complex Script Rendering:**
   - Both `Noto Sans Devanagari` and `Noto Sans Kannada` web fonts are bundled via Google Fonts CDN in `src/index.css` to ensure crisp rendering of conjunct consonants (ottu / matras) across all platforms.
