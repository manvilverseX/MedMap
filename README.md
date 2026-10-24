# MedMap (SIH26047 — Ministry of Ayush / AIIA)

**MedMap** is an AI-assisted pre-consultation patient intake and clinical case-taking platform developed for the Ministry of Ayush and the All India Institute of Ayurveda (AIIA). It bridges the gap between patient self-reporting, physical record digitization, and physician decision-making.

---

## Key Capabilities

1. **Adaptive Clinical Intake:** Multilingual conversational intake engine (English, Hindi, Kannada) with dynamic follow-up questioning and personal history collection (diet, sleep, tobacco/alcohol, occupation).
2. **AYUSH / Ayurveda Pathway (Draft):** Structured exploration of the 10 Dashavidha Pariksha parameters (Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya, Sattva, Ahara Shakti, Vyayama Shakti, Vaya, plus Agni and Koshtha).
3. **Voice & Touch First:** Integrated browser-based Web Speech API for voice dictation (`en-IN`, `hi-IN`, `kn-IN`) and question text-to-speech with touch-friendly correction.
4. **Resilient Multimodal Document Upload:** Dual-mode upload flow: Vercel Blob presigned upload for cloud deployments with automatic fallback to FastAPI local multipart storage for offline / localhost runs.
5. **Deterministic Extraction & Offline Demo Fallback:** Groq Cloud multimodal vision/LLM parsing with built-in regex offline fallback (`source: "offline_demo_fallback"`) when keys or network are unavailable.
6. **Physician Verification Controls:** Per-item Accept (✓), Edit (✏️), and Reject (✕) controls on all extracted entities. Rejected facts are visibly struck through and excluded from exports.
7. **Complete Source Provenance:** 🔍 Evidence links on every extracted fact connect directly to raw document snippets and uploaded file previews.
8. **HL7 FHIR R4 Bundle Export:** Finalized clinical cases export to valid FHIR R4 Bundles including `Patient`, `Encounter`, `Condition`, `MedicationRequest`, and `Observation` (lab results) resources.
9. **ABDM Mock Workflow Simulation:** Fully simulated Ayushman Bharat Digital Mission (ABDM) flow with a 6-stage lifecycle timeline, revocable consent dialogs, and mandatory simulation badges.
10. **Hospital Admin Triage Dashboard:** Real-time intake queue with status counts, prominent safety red-flag panels, and audited triage acknowledgments.
11. **Shared-Device Kiosk Privacy:** End-of-flow "Finish & Clear This Device" action with JWT revocation, storage wipe, and a 5-minute inactivity countdown banner.

---

## Non-Negotiable Safety & Ethical Guidelines

- **AI is NOT the Doctor:** MedMap collects, transcribes, structures, and highlights clinical information. It NEVER computes an automated diagnosis or replaces physician judgment.
- **ABDM Honesty Rule:** ABDM integration is a clearly labeled **MOCK / SIMULATION**. Every ABDM screen carries the badge: `"Simulation: not connected to ABDM"`. No live network calls are made to government registries.
- **AYUSH Honesty Rule:** The Ayurveda questionnaire is a **DRAFT** questionnaire requiring review and validation by a qualified Ayurvedic practitioner. Self-reported observations are displayed grouped under parameters without a computed Prakriti diagnosis.
- **Never Guess Missing Data:** Unknown clinical information remains explicitly labeled as `"Unknown"` or `"(Not reported)"`.
- **Zero Secrets in Source:** No secrets or API credentials are committed to version control.

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, React Router 7, Vanilla CSS design system.
- **Frontend Testing:** Vitest, React Testing Library, JSDOM.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy ORM, SQLite (local) / PostgreSQL (production).
- **Backend Testing:** Pytest, HTTPX TestClient.
- **AI & Vision:** Groq Cloud (configured model `openai/gpt-oss-120b`, configurable via `GROQ_MODEL`) with deterministic regex fallback.
- **Voice & Speech:** Sarvam AI (`bulbul:v3` TTS, `saaras:v4` STT) with Groq `whisper-large-v3` STT fallback and Web Speech API client fallback.

---

## Local Development & Setup

### Prerequisites
- Node.js 20+ and npm
- Python 3.11+ or 3.12+

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (if using Alembic) or initialize database
# Seed deterministic demo cases and credentials
python seed_e2e_cases.py

# Start FastAPI development server on port 8000
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
# In repository root:
npm install

# Run Vitest test suite
npm test

# Verify production build
npm run build

# Start Vite development server on port 5173
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables (By Name Only)

Refer to `.env.example` in the root and `backend/.env.example`. Do **NOT** commit `.env` files with secret values.

### Backend (`backend/.env`)
- `SECRET_KEY`: Random 32+ character string used for signing JWT access tokens.
- `ALGORITHM`: Token signing algorithm (e.g. `HS256`).
- `DATABASE_URL`: SQLAlchemy connection string (e.g. `sqlite:///./medmap.db`).
- `GROQ_API_KEY`: API key for Groq Cloud LLM / vision service (optional; offline demo fallback activates if unset).
- `INITIAL_ADMIN_PASSWORD`: Default password for initial administrator seeding.

### Frontend (`.env` / `.env.local`)
- `VITE_API_URL`: Backend base API URL (e.g. `http://localhost:8000/api/v1` locally).

### Cloud / Vercel Serverless (`api/blob-*`)
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob store token for private document storage (optional locally; direct upload fallback activates when missing).
- `INTERNAL_API_SECRET`: Shared secret used to protect Vercel serverless read proxy routes.

---

## Demo Credentials & Seeded Cases

Run `python backend/seed_e2e_cases.py` to reset the deterministic demo dataset:

| Role | Username | Password | Default Landing |
| :--- | :--- | :--- | :--- |
| **Demo Doctor (Evaluation)** | `demo_doctor` | `demo_doctor_password123` (or env `DEMO_DOCTOR_PASSWORD`) | `/doctor/cases` |
| **Standard Doctor** | `doctor` | `password123` | `/doctor/cases` |
| **Hospital Admin** | `admin` | `admin123` | `/admin/queue` |
| **Patient** | `patient` | `password123` | `/patient` |

### Pre-Seeded Clinical Cases:
1. `demo-cardiac-redflag`: Acute crushing substernal chest pain radiating to arm/jaw; triggers prominent cardiac red-flag triage alert.
2. `demo-diabetes-repeat`: Longitudinal repeat visit for Type 2 Diabetes; highlights Metformin dosage escalation from 500mg to 1000mg BD; includes attached lab report and prescription PDFs.
3. `demo-ayush-history`: Chronic Amlapitta (Hyperacidity); includes comprehensive self-reported Dashavidha Pariksha observations with clear draft disclaimers.
4. `demo-kannada-fever`: Acute febrile illness in Kannada (ಕನ್ನಡ); showcases bilingual answer persistence, Kannada voice matching, and doctor side-by-side evidence inspection.
5. `demo-hindi-cough`: Allergic bronchitis with dry cough in Hindi (हिन्दी); demonstrates Hindi intake, translation caching, and doctor bilingual toggle.

---

## Multilingual Architecture (English, Hindi, Kannada)

MedMap bridges regional language patient communication while maintaining absolute clinical safety and international data standards:
- **English Canonical Foundation:** The backend state machine, clinical graph, safety rules, and FHIR export logic operate strictly in English.
- **Bilingual Answer Records:** Free-text patient responses are translated on intake and stored as `{value: english, original: native_text, lang}`. Choice-based questions retain stable English IDs with localized labels.
- **Live Groq Translation:** Live translation utilizes Groq with the configured `GROQ_MODEL` (e.g. `openai/gpt-oss-120b`) with automatic two-tier caching:
  - Database level: `translation_cache` table prevents redundant LLM calls.
  - Browser level: `sessionStorage` caches UI dictionary translations for instant navigation.
- **Reliable Server-Side Voice & Audio:** Kannada and Hindi voice input and read-aloud use server-side AI processing via Sarvam AI (`bulbul:v3` for TTS, `saaras:v4` for STT with Groq `whisper-large-v3` fallback). English retains the browser Web Speech API. Audio responses are cached in memory for instant replay, and AI voice transcripts are placed into editable fields with consent disclosures and verification notices.
- **Offline & Throttling Resilience:** When internet connectivity is lost or Groq rate limits are encountered, intake seamlessly falls back to English with clear visual notifications (`aiTranslationTag`), ensuring zero disruption to patient triage.

---

## Running the Automated Test Suites

### Backend Tests (Pytest)
```bash
cd backend
.\venv\Scripts\python.exe -m pytest tests -q
# Result: 216 passed, 2 warnings, 9 subtests passed in ~43s (includes translation & multilingual intake suites).
```

### Frontend Tests (Vitest)
```bash
npm test
# Result: 9 test files, 35 passing unit and integration tests (includes multilingual i18n & doctor inspection).
```

### Static Analysis and Production Build
```bash
npm run build
# Result: Exit code 0, 151 modules transformed, 0 errors.
```

---

## Documentation Index

- `docs/DEMO_SCRIPT.md`: Step-by-step 17-phase presentation script including complete Kannada patient and doctor walkthrough.
- `docs/MANUAL_QA_CHECKLIST.md`: Master 30-item QA matrix covering multilingual and clinical verification.
- `docs/LANGUAGE_STATUS.md`: Comprehensive multilingual architecture, caching, speech synthesis voice check, and caveats.
- `docs/ABDM_STATUS.md`: Complete specification of ABDM mock simulation boundaries.

---

## Known Limitations & Human Decisions Needed

1. **Ayurveda Clinical Review:** The Dashavidha Pariksha questionnaire and parameters are a prototype draft and require formal clinical validation by qualified Ayurvedic faculty before clinical deployment.
2. **Translation Review:** Hindi and Kannada questionnaire translations are prototype drafts generated via Groq LLM and should undergo formal medical translation review.
3. **ABDM Live Sandbox:** Transitioning from the current mock simulation to real ABDM Sandbox requires National Health Authority (NHA) client credentials and live bridge certificate enrollment.
