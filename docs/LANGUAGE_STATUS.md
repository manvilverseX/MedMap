# MedMap — Multilingual Architecture & Language Status (`docs/LANGUAGE_STATUS.md`)

## Executive Summary

MedMap supports **English (`en`)**, **Hindi (`hi`)**, and **Kannada (`kn`)** across the entire pre-consultation workflow. The system bridges regional patient communication in India's official and state languages while strictly preserving clinical safety, deterministic rule processing, and international interoperability.

---

## Architectural Principles

### 1. English is the Canonical Clinical Language
- The backend state machine, clinical graph, red-flag triggers, gap detection, drug interaction checks, and FHIR R4 schema mapping operate exclusively on English clinical tokens.
- Doctor and Hospital Admin portals remain in English. The Doctor case review interface provides an explicit toggle (`English (Canonical) | Patient's Language (kn/hi)`) to inspect verbatim patient words alongside canonical English clinical interpretations.
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

### 2. Tiered Translation Resolution Order
To eliminate English leaks while ensuring high performance, MedMap resolves patient-facing strings through five strict tiers:
1. **Static Pre-Compiled Dictionary (`src/i18n/strings.ts`):** High-speed compile-time dictionary covering 354 UI keys with native Kannada (`KN_STRINGS`) and Hindi (`HI_STRINGS`) strings.
2. **Session Storage UI Cache:** Client-side cache (`medmap_i18n_kn`, `medmap_i18n_hi`) storing previously fetched dynamic translations.
3. **Database Translation Cache (`POST /api/v1/translate/ui` & `translation_cache` table):** SHA-256 hashed persistent server cache pre-warmed via `backend/warm_translation_cache.py`.
4. **Live Groq LLM Translation:** On-demand fallback using Groq LLM (`openai/gpt-oss-120b`).
5. **Static Curated Indic Bank (`curated_translations_hi_kn.json`):** 650 pre-translated clinical questions, chips, domain categories, error messages, and onboarding prompts (100% complete in Hindi and Kannada). Includes `previous_investigations`, `other_history`, `ayush_samprapti`, and the 4-step patient intake walkthrough.
6. **Canonical English Fallback (Last Resort):** Returned only if translation service is unreachable, accompanied by an explicit localized banner (*"ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ, ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ"* / *"अनुवाद सेवा अनुपलब्ध है"*).

### 3. Patient Screen Allowlist
Rural patient screens in `kn` and `hi` must contain zero English text, with the sole exception of the strictly defined allowlist:
- **Brand Name:** `MedMap`
- **Acronyms:** `ABHA`, `ABDM`
- **AI Token:** Native `ಎಐ` / `एआई` preferred, Latin `AI` permitted
- **Drug Names:** Clinical entity names (e.g. `Paracetamol`, `Metformin`, `Amoxicillin`)
- **Doses & Units:** Standard medical and file units (`500mg`, `10ml`, `MB`, `KB`)
- **Numbers & Dates:** Patient-typed or extracted calendar dates and numerical counts
- **File Names:** Uploaded documents (e.g. `discharge_summary.pdf`, `prescription.jpg`)
- **Patient Free-Text:** Raw input explicitly entered by the user

### 4. Non-Medical Validation Notice
> [!IMPORTANT]
> All Kannada and Hindi translations in the static dictionary and dynamic translation service are AI-generated and author-drafted for low-literacy rural patient accessibility. They are **not medically validated or certified clinical translations**. English remains the sole canonical medical authority for diagnostic, safety, and prescribing decisions.

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
