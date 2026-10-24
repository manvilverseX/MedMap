# MedMap — Verified Architecture & Presentation Facts (`docs/PPT_FACTS.md`)

**Project:** MedMap (SIH26047 — Ministry of Ayush / AIIA)  
**Verification Date:** October 2026  
**Audience:** Judges, Presenters, Reviewers, Engineering Team

---

## 1. Executive Summary & Verified Stack

| Component | Verified Technology / Provider | Configuration / Environment Variable | Fallback Tier |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite 8, React Router 7 | Client-side SPA, Vanilla CSS tokens | N/A |
| **Backend API** | Python 3.12, FastAPI, SQLAlchemy ORM | Local development & Vercel serverless (`api/index.py`) | N/A |
| **Database** | SQLite (Local Dev/CI) / PostgreSQL (Production) | `DATABASE_URL` | N/A |
| **Primary LLM & Reasoning** | Groq Cloud API — `openai/gpt-oss-120b` | `GROQ_MODEL=openai/gpt-oss-120b` | Deterministic offline regex & rule fallback (`source: "offline_demo_fallback"`) |
| **Document Vision / OCR** | Groq Cloud API — `qwen/qwen3.8-27b` | `GROQ_DOCUMENT_MODEL=qwen/qwen3.8-27b` | Regex deterministic extraction + file storage |
| **Speech-to-Text (STT)** | Sarvam AI — `saaras:v3` (`kn-IN`, `hi-IN`) | `SARVAM_API_KEY` | 1. Groq `whisper-large-v3`<br>2. Browser Web Speech API (`SpeechRecognition`) |
| **Text-to-Speech (TTS)** | Sarvam AI — `bulbul:v3` (kn: `kavitha`, hi: `priya`) | `SARVAM_API_KEY` | Browser `window.speechSynthesis` (safe-muted if voice missing) |
| **Live Translation** | Groq Cloud API (`openai/gpt-oss-120b`) | `GROQ_MODEL` | Multi-tier cache (DB `translation_cache` -> `curated_translations_hi_kn.json`) |
| **Interoperability Standards** | HL7 FHIR R4 Bundle (Document Profile) | Native validator & JSON export | Pre-consultation + Doctor Finalized Records mapped |
| **ABDM Status** | Mock / Simulation Sandbox (M1/M2 schemas) | Simulated ABHA, OTP, consent, care contexts | Conforms to NHA ABDM specifications with mandatory disclaimers |

---

## 2. Model & Fallback Chains (Verified)

### A. Clinical Summarization & Extraction Pipeline
$$\text{Patient Speech/Text} \xrightarrow{\text{Sarvam/WebSpeech}} \text{Editable Native Text} \xrightarrow{\text{Groq / Cache}} \text{Bilingual Record} \xrightarrow{\text{FastAPI State Machine}} \text{English Canonical Clinical Graph}$$

1. **Patient Input:** Speech recorded via `MediaRecorder` (`audio/webm` or `audio/mp4`) or typed.
2. **STT Transcription:** `POST /api/v1/speech/stt` passes audio to Sarvam `saaras:v3`. If missing key or error occurs, seamlessly falls back to Groq `whisper-large-v3`.
3. **Editable Review:** Result is placed into editable text field with an AI disclaimer notice; **never auto-submitted**.
4. **Translation:** Free-text translated to English via `POST /api/v1/translate/texts` using Groq `openai/gpt-oss-120b`, checking SQLite/Postgres `translation_cache` first.
5. **Storage:** Stored bilingually: `{"value": "English canonical", "original": "Native utterance", "lang": "kn"}`.

### B. Document Intelligence Pipeline
$$\text{Medical Document (PDF/Image)} \xrightarrow{\text{Blob/Local Upload}} \text{FastAPI Storage} \xrightarrow{\text{Groq Vision / OCR}} \text{Structured Entities} \xrightarrow{\text{Doctor Audit View}} \text{FHIR R4 Bundle}$$

1. **Upload:** Presigned Vercel Blob with transparent fallback to direct local multipart upload.
2. **Duplicate Check:** SHA-256 content hashing detects duplicate uploads across encounters and warns user.
3. **OCR & Extraction:** Groq `qwen/qwen3.8-27b` extracts raw text and parses medicines, dosages, lab tests, and dates.
4. **Doctor Inspection:** Doctor can inspect raw OCR text side-by-side with original document image/PDF and edit or reject extracted facts.

---

## 3. Question Counts & Schema Breakdown

MedMap features **30 distinct clinical and AYUSH questions** orchestrated dynamically:

### A. General Clinical Pathway (11 Questions)
| Question ID | Category | Allows "None / No"? | Verification Behavior |
| :--- | :--- | :---: | :--- |
| `chief_complaint` | Chief Complaint | No | Alphanumeric validation; red-flag triage detection |
| `present_illness` | History of Present Illness | No | Detailed narrative with duration and progression |
| `past_medical` | Past Medical History | Yes | Chronic condition check |
| `past_surgical` | Past Surgical History | Yes | Previous operations and interventions |
| `medications` | Medication History | Yes | Triggers critical confirmation dialog |
| `allergies` | Allergies | Yes | Triggers critical confirmation dialog |
| `allergy_reaction` | Allergy Reaction | Yes | Follow-up on severity and reaction symptoms |
| `family_history` | Family History | Yes | Familial genetic risk factors |
| `review_of_systems` | Review of Systems | Yes | Multi-system symptom exploration |
| `previous_investigations` | Previous Investigations | **Yes** (`allowsNone=True`) | Prompts for prior lab reports/scans with chip options |
| `other_history` | Other Relevant History | **Yes** (`allowsNone=True`) | Open floor for patient to add remaining concerns |

### B. Personal History Pathway (4 Questions)
| Question ID | Category | Focus Area |
| :--- | :--- | :--- |
| `personal_diet` | Dietary Habits | Vegetarian, Non-vegetarian, meal timing |
| `personal_sleep` | Sleep Quality | Insomnia, sleep duration, disturbance |
| `personal_habits` | Habits & Exposures | Smoking, tobacco, alcohol, substance use |
| `personal_occupation` | Occupational History | Physical labor, desk job, occupational hazards |

### C. AYUSH / Ayurveda Pathway (15 Questions — Draft)
| Question ID | Category / Parameter | Clinical Significance |
| :--- | :--- | :--- |
| `ayush_prakriti` | Prakriti (Constitution) | Baseline physical and metabolic tendencies |
| `ayush_vikriti` | Vikriti (Current Morbidity) | Current dosha aggravation |
| `ayush_sara` | Sara (Tissue Excellence) | Vitality and tissue quality |
| `ayush_samhanana` | Samhanana (Compactness) | Body build and muscular integrity |
| `ayush_pramana` | Pramana (Proportions) | Body measurements and nutritional state |
| `ayush_satmya` | Satmya (Habituation) | Adaptability to climate, diet, and medicines |
| `ayush_sattva` | Sattva (Mental Strength) | Emotional resilience and mental temperament |
| `ayush_ahara_shakti` | Ahara Shakti (Digestive Capacity)| Appetite and digestion capacity |
| `ayush_vyayama_shakti`| Vyayama Shakti (Physical Capacity)| Exercise endurance and work capacity |
| `ayush_vaya` | Vaya (Age / Stage of Life) | Chronological and biological life stage |
| `ayush_agni` | Agni (Digestive Fire) | Mandagni, Vishamagni, Tikshnagni, Samagni |
| `ayush_koshtha` | Koshtha (Bowel Habit) | Krura, Madhyama, Mridu bowel tendencies |
| `ayush_ahara_vihara` | Ahara-Vihara (Diet & Lifestyle) | Daily routine, food incompatibilities |
| `ayush_nidana` | Nidana (Causative Factors) | Etiological triggers and aggravating factors |
| `ayush_samprapti` | Samprapti (Pathogenesis History) | Patient-reported symptom progression (**allowsNone=False**) |

---

## 4. Translation & Dictionary Scale

- **Curated Static Indic Translation Bank (`curated_translations_hi_kn.json`):**
  - Total Entries: **650 items**
  - Hindi Entries: **650** (100% complete native Devanagari)
  - Kannada Entries: **650** (100% complete native Kannada script)
- **Frontend Core Dictionary (`src/i18n/strings.ts`):**
  - Total Keys: **354 keys** per language
  - Zero Latin character leaks on patient-facing screens outside strictly allowlisted technical acronyms (`MedMap`, `ABHA`, `ABDM`).

---

## 5. Automated Test Suite Metrics

| Test Suite | Framework | Files | Test Count | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Backend Integration & Unit Tests** | Pytest, HTTPX TestClient | 36 files | **342 tests** | **100% PASS** |
| **Frontend Unit & Component Tests** | Vitest, React Testing Library | 17 files | **95 tests** | **100% PASS** |
| **Total Automated Regression Tests** | — | **53 files** | **437 tests** | **100% PASS** |
| **Vite Production Build** | TypeScript Compiler (`tsc`) + Vite | — | 0 errors | **SUCCESS** |

---

## 6. FHIR R4 Bundle Mapping Details

MedMap exports valid HL7 FHIR R4 Bundles (`Bundle` resource of type `document`):

| Information Domain | Source in MedMap | FHIR Resource Type |
| :--- | :--- | :--- |
| Document Composition | Case Header & Metadata | `Composition` |
| Patient Demographics | Patient Onboarding Data | `Patient` |
| Clinical Visit Context | Case Encounter Metadata | `Encounter` |
| Extracted Diagnoses | Document Intelligence & Doctor Review | `Condition` |
| Prescribed Medications | Document OCR & Doctor Finalized Record | `MedicationRequest` |
| Lab Investigations | Document Extraction & Doctor Verification | `ServiceRequest` / `Observation` |
| Treatment & Advice Notes | Doctor Final Consultation Note | `CarePlan` |
| Verified Allergies | Patient Reported & Doctor Finalized Record | `AllergyIntolerance` |

---

## 7. Mandatory Disclaimers & Honest Truths

Presenters must adhere strictly to the following guidelines:

1. **AI is NOT the Doctor:** MedMap is an intake, transcription, extraction, and structuring tool. It does **not** generate automated medical diagnoses, nor does it replace licensed clinical judgment.
2. **ABDM Status is MOCK / SIMULATION:** MedMap implements the workflow, data contracts, and M1/M2 schemas of the Ayushman Bharat Digital Mission (ABHA verification, care-context linking, consent artifact exchange). However, **it is not connected to the live government ABDM Gateway**. Every ABDM screen visibly displays the badge: `"Simulation: not connected to ABDM"`.
3. **Ayurveda Pathway is DRAFT:** The Dashavidha Pariksha questionnaire collects patient-reported observations. It **does not compute an automated Prakriti score or dosha imbalance**. It is a preliminary pre-consultation aid designed for review by a qualified Ayurvedic doctor.
4. **AI Translations are Machine Drafts:** Hindi and Kannada questionnaires are generated and curated for rural accessibility. They are not certified legal or medical translations.
