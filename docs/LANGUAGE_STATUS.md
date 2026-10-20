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
- Translation is performed using the existing `Groq` LLM client with the configured model (defined by `GROQ_MODEL`, e.g. `openai/gpt-oss-120b`).
- No additional translation vendor is required for text translation.
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

### Reliable Server-Side Speech (Kannada & Hindi)
- **Speech Synthesis (TTS - Read Aloud):**
  - For Kannada (`kn`) and Hindi (`hi`), audio playback calls the backend endpoint `POST /api/v1/speech/tts`.
  - The backend calls Sarvam AI's Text-to-Speech API (`model: "bulbul:v3"`, target language codes `kn-IN` / `hi-IN` with default female voices such as `roopa` for Kannada and `priya` for Hindi).
  - Returns audio bytes (`audio/wav`) with `Cache-Control: public, max-age=86400`.
  - The frontend caches audio blobs in-memory per `(language, text)` so repeated question replays are instant.
  - If the backend TTS call fails, MedMap gracefully falls back to the browser's `window.speechSynthesis` *only if* a matching native voice exists for the language; otherwise, it presents a clear user message without safe-muting to English:
    - Kannada: `ℹ️ ಧ್ವನಿ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಪರದೆಯ ಮೇಲಿನ ಪ್ರಶ್ನೆಯನ್ನು ಓದಿ.`
    - Hindi: `ℹ️ आवाज़ वर्तमान में उपलब्ध नहीं है। कृपया स्क्रीन पर प्रश्न पढ़ें।`
  - English retains the standard client-side Web Speech API path.
- **Speech-to-Text (STT - Voice Input):**
  - For Kannada (`kn`) and Hindi (`hi`), voice input captures microphone audio via `navigator.mediaDevices.getUserMedia` and `MediaRecorder` (using supported mime types such as `audio/webm;codecs=opus` or `audio/mp4`).
  - States: `idle` -> `recording` (with visible 30-second countdown timer, tap-to-stop, auto-stop at 30s) -> `transcribing` -> `done`.
  - Recorded audio is sent to `POST /api/v1/speech/stt` with the patient's language code (`kn` / `hi`).
  - The backend invokes Sarvam AI Speech-to-Text (`model: "saaras:v4"`, language code `kn-IN` / `hi-IN`). If `SARVAM_API_KEY` is missing or Sarvam fails, the backend automatically falls back to Groq `whisper-large-v3`.
  - The resulting transcript is populated into the editable intake answer input and is **never auto-submitted**, allowing the patient to inspect and correct their answer.
  - An informative disclaimer is displayed: *"AI transcription - please check and correct before continuing."* (localized in Kannada and Hindi).
  - English retains the browser Web Speech API `SpeechRecognition` path.

### Privacy & Consent Disclosure
- When voice input or audio playback is used, voice and audio data are processed securely by an AI service (Sarvam AI, with Groq Whisper as fallback).
- The patient consent agreement explicitly informs patients of this: *"Voice and audio recordings, when used, are securely processed by an AI service for transcription and playback."* (also localized in Hindi and Kannada).

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
