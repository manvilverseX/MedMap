# MedMap — Master Plan vs. Implementation Consistency Analysis (`docs/PLAN_CONSISTENCY.md`)

**Document Purpose:** Cross-reference discrepancies between the original planning document (`medmap_master_project_plan.md`, specifically Sections 17.1, 18, and 20) and the production-verified codebase. Provides corrected presentation bullet points to ensure 100% honesty during technical reviews and demonstrations.

> [!IMPORTANT]
> The original master project plan is preserved unaltered as an archival baseline. This document serves as the canonical reconciliation of planned architecture versus delivered reality.

---

## 1. Discrepancy & Remediation Summary Matrix

The following table contrasts the baseline plan statements against the initial implementation state, the gap remediation delivered across Phases 1–7, and the recommended presentation wording:

| Domain / Section | Original Master Plan Statement | Initial Code State (Pre-Audit) | Post-Remediation State (Phases 1–7) | Recommended Corrected Wording for Presentation / PPT |
| :--- | :--- | :--- | :--- | :--- |
| **LLM & Reasoning**<br>*(Sec 17.1, 20.3, 20.6)* | *"AI/LLM: Gemini API"*, *"Gemini Structured Outputs"* | Groq Cloud API with `openai/gpt-oss-120b`. No Gemini SDK. | **Groq Cloud API** (`openai/gpt-oss-120b`) with deterministic regex/rule offline fallback. | *"LLM & Clinical Reasoning: Groq Cloud API running open-source `openai/gpt-oss-120b` with deterministic rule-based offline fallback."* |
| **Document Vision / OCR**<br>*(Sec 9, 17.1, 18)* | *"OCR + Multimodal AI"* (unspecified provider) | Groq Cloud vision API with `qwen/qwen3.8-27b`. | **Groq Cloud Vision** (`qwen/qwen3.8-27b`) extracting text and clinical entities. | *"Document OCR & Entity Extraction: Groq Cloud multimodal vision (`qwen/qwen3.8-27b`) with OCR text extraction and clinical parsing."* |
| **Speech Engine**<br>*(Sec 17.1, 18)* | *"Speech-to-Text + Text-to-Speech"* (unspecified provider) | Sarvam AI with Whisper and browser fallbacks. | **Sarvam AI** (`saaras:v3` STT, `bulbul:v3` TTS) + Groq `whisper-large-v3` STT fallback + Web Speech client fallback. | *"Speech Engine: Sarvam AI for Indic languages (`saaras:v3`, `bulbul:v3`), Groq Whisper fallback, and Web Speech API."* |
| **Interoperability (ABDM)**<br>*(Sec 15.2, 17.1, 20.2)* | *"FHIR + ABDM"*, *"ABDM exchange"* | Simulated UI and mocked backend responses; no live gateway. | **Conforming ABDM Mock/Simulation**: Complete M1/M2 flow (ABHA verification, care-context linking, consent lifecycle, audit trail) with mandatory simulation badges on all screens. | *"ABDM Compliance: Conforming workflow simulation implementing M1/M2 milestone schemas, revocable consent dialogs, and clear simulation badges (not connected to live ABDM gateway)."* |
| **Doctor Finalized Record to FHIR**<br>*(Sec 5, 13, 15.1, 20.3)* | *"Doctor finalizes record -> Data mapped to FHIR"* | Only pre-existing extracted entities reached FHIR. Doctor consultation assessments, prescriptions, and advice were excluded. | **Fully Implemented in Gap 2 (`045ff72`)**: Doctor-entered assessments map to `Condition`, prescriptions to `MedicationRequest`, advice to `CarePlan`, and verified allergies to `AllergyIntolerance`. | *"HL7 FHIR R4 Export: Pre-consultation entities and doctor-finalized clinical records (diagnoses, prescriptions, allergies, care plan) map to a valid FHIR R4 Document Bundle."* |
| **Machine-Read OCR Text Panel**<br>*(Sec 9.2, 24)* | *"OCR text inspectable by the doctor"* | Only parsed structured entities and summary were shown; raw extracted OCR text was hidden. | **Fully Implemented in Gap 3 (`6e3808c`)**: Inspectable "Raw Machine-Read Text (OCR)" panel with toggle, copy-to-clipboard, and line count indicators. | *"Full Document Provenance: Doctors can inspect raw machine-read OCR text side-by-side with original document previews and structured extractions."* |
| **Duplicate Document Detection**<br>*(Sec 9.4, 18)* | *"Duplicate document detection"* | Allowed identical file re-uploads without warning. | **Fully Implemented in Gap 4 (`34ea607`)**: Content-based SHA-256 deduplication detects duplicate files across cases, prompts user with timestamp of previous upload, and prevents duplicate processing. | *"Document Deduplication: SHA-256 content hashing detects duplicate reports across longitudinal visits and flags them for doctor and patient."* |
| **Intake History Completeness**<br>*(Sec 10, 18, 20)* | Comprehensive clinical history including previous investigations, other health concerns, and Samprapti. | Omitted `previous_investigations`, `other_history`, and `ayush_samprapti`. | **Fully Implemented in Gap 5 (`154e549`)**: Added `previous_investigations` (`allowsNone=True`), `other_history` (`allowsNone=True`), and `ayush_samprapti` (`allowsNone=False`) across backend, frontend, and localized dictionaries. | *"Intake Scope: Complete 30-question adaptive engine covering chief complaint, HPI, review of systems, previous investigations, lifestyle, and AYUSH Dashavidha Pariksha with Samprapti."* |
| **Patient Walkthrough & Guidance**<br>*(Sec 16.1, 20)* | Intuitive rural accessibility and guided orientation. | Intake began immediately without orientation. | **Fully Implemented in Gap 6 (`555c16b`)**: 4-step first-time patient walkthrough modal in English, Hindi, and Kannada with read-aloud support and shared-device privacy instructions. | *"Rural Accessibility: Guided 4-step onboarding overlay with native audio guidance, touch chips, and shared-device privacy orientation."* |
| **Security & Rate Limiting**<br>*(Sec 16.2)* | Secure session handling and access control. | Generic 7-day token lifetime, no rate limiting. | **Fully Implemented in Gap 7 (`b2055d8`)**: Configured safe token lifetimes (patient: 4h, staff: 12h) and in-memory sliding-window rate limiting on auth, cases, and speech endpoints. | *"Enterprise Security: Role-based JWT lifetimes, sliding-window rate limiting, and shared-device session wipe upon exit."* |

---

## 2. Master Plan Section 18: AI/ML Component Map Reconciliation

| Master Plan Component | Master Plan Purpose | Status in Master Plan | Delivered Status | Verified Technical Implementation |
| :--- | :--- | :---: | :---: | :--- |
| **Conversational AI / LLM** | Natural-language intake and structuring | Planned | **Working** | Groq `openai/gpt-oss-120b` via `app/services/ai_service.py` |
| **Adaptive Questioning** | Chooses relevant next question | Planned | **Working** | State machine in `adaptive_intake.py` + `policy_engine.py` |
| **Speech / ASR (STT)** | Voice to text | Planned | **Working** | Sarvam `saaras:v3` (`kn-IN`, `hi-IN`) + Groq Whisper fallback |
| **Text-to-Speech (TTS)** | Spoken prompts and guidance | Planned | **Working** | Sarvam `bulbul:v3` (kn: `kavitha`, hi: `priya`) + Web Speech fallback |
| **Multilingual Handling** | Indian-language interaction | Planned / Challenging | **Working** | Full Kannada, Hindi, and English coverage (650-item curated bank) |
| **Noise Handling** | Hospital ambient noise mitigation | Planned / Challenging | **Partial** | Client-side audio recording chunking and codec normalization; no deep ML noise suppression |
| **OCR** | Image/PDF to text | Planned | **Working** | Groq `qwen/qwen3.8-27b` multimodal OCR |
| **Medical Extraction** | Text to medicines, tests, diagnoses | Planned | **Working** | Structured JSON schema extraction with regex deterministic fallback |
| **Document Understanding** | Medical meaning beyond raw OCR | Planned | **Working** | Categorization, timeline dating, and dosage change correlation |
| **Summarization** | Doctor-facing pre-consultation brief | Planned | **Working** | Dynamic clinical narrative generation with bilingual toggle |
| **Red-Flag Detection** | Urgency alert for triage staff | Planned | **Working** | Deterministic rule engine (`clinical_gaps.py`, `clinical_intelligence.py`) |
| **Duplicate Detection** | Repeated documents / information | Planned | **Working** | SHA-256 document hashing (`documents.py`) + duplicate medicine detection |
| **Medication Change Detection** | Compare medicines over time | Planned | **Working** | Longitudinal comparison engine (`longitudinal.py`) |
| **Missing Information** | Identify clinical gaps | Planned | **Working** | `clinical_gaps.py` gap detection highlights unaddressed symptoms |
| **Confidence Estimation** | Show extraction uncertainty | Optional | **Mock / Partial** | Confidence tags displayed on entities; heuristic-based scoring |
| **Medical History Graph** | Connect condition/lab/medicine/visit | Optional | **Working** | Unified relational schema (`unified_clinical_events`, `clinical_evidence`) |

---

## 3. Master Plan Section 20: Presentation Content Guidelines

When compiling slides or delivering spoken presentations based on Section 20 ("SIH PPT - Master Content"), use the following authoritative replacements:

### Slide 3: Proposed Architecture
- **Plan Baseline:** Showed generic "Gemini API" and "Speech Recognition".
- **Approved Reality:** Present the exact multi-tier pipeline:
  - Frontend: React 19 + TypeScript (Vanilla CSS design system).
  - Backend: FastAPI with SQLite/Postgres.
  - Speech: Sarvam AI Indic models (`saaras:v3`, `bulbul:v3`) with Groq Whisper fallback.
  - AI & Vision: Groq Cloud (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`).
  - Cache: 3-tier translation cache (In-memory LRU -> Relational DB -> Static 650-entry bank).

### Slide 4: ABDM & Digital Health
- **Plan Baseline:** Implied live ABDM exchange.
- **Approved Reality:** Explicitly frame as a **conforming simulation**:
  - *"Implements complete ABDM M1 & M2 workflow specifications (ABHA address verification, mock OTP authentication, care-context linking, consent manager flow). Displays clear simulation badges to protect production integrity."*

### Slide 5: AYUSH & Traditional Knowledge
- **Plan Baseline:** Mentioned automated Prakriti classification.
- **Approved Reality:** Frame strictly as a clinical decision-support tool:
  - *"Digital Dashavidha Pariksha pre-consultation intake collecting 15 patient-reported parameters including Agni, Koshtha, and Samprapti history. Strictly labeled as a draft questionnaire for review by an Ayurvedic practitioner without automated dosha diagnoses."*

### Slide 6: Doctor Verification & Safety
- **Plan Baseline:** Emphasized AI summarization.
- **Approved Reality:** Emphasize the **two-layer human verification**:
  - *"Patient confirms intake summary and critical medicines/allergies -> Doctor inspects raw OCR, accepts/edits/rejects individual facts -> Finalized doctor record maps directly into FHIR R4 Bundle."*
