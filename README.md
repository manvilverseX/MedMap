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
- **AI & Vision:** Groq Cloud (`llama-3.3-70b-versatile`) with deterministic regex fallback.
- **Health Standards:** HL7 FHIR R4 Bundle specifications (`Observation`, `Condition`, `MedicationRequest`, `Encounter`, `Patient`).

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
| **Doctor** | `doctor` | `password123` | `/doctor/cases` |
| **Hospital Admin** | `admin` | `admin123` | `/admin/queue` |
| **Patient** | `patient` | `password123` | `/patient` |

### Pre-Seeded Clinical Cases:
1. `demo-cardiac-redflag`: Acute crushing substernal chest pain radiating to arm/jaw; triggers prominent cardiac red-flag triage alert.
2. `demo-diabetes-repeat`: Longitudinal repeat visit for Type 2 Diabetes; highlights Metformin dosage escalation from 500mg to 1000mg BD; includes attached lab report and prescription PDFs.
3. `demo-ayush-history`: Chronic Amlapitta (Hyperacidity); includes comprehensive self-reported Dashavidha Pariksha observations with clear draft disclaimers.

---

## Running the Automated Test Suites

### Backend Tests (Pytest)
```bash
cd backend
.\venv\Scripts\python.exe -m pytest
# Result: 197 passing tests across authentication, adaptive intake, FHIR, audit, and privacy.
```

### Frontend Tests (Vitest)
```bash
npm test
# Result: 8 test files, 28 passing unit and integration tests.
```

### Static Analysis and Production Build
```bash
npm run build
npm run lint
git diff --check
```

---

## Documentation Index

- `docs/DEMO_SCRIPT.md`: Step-by-step 16-phase presentation script with offline backup paths.
- `docs/MANUAL_QA_CHECKLIST.md`: Master 25-item QA matrix with status and verification evidence.
- `docs/ABDM_STATUS.md`: Complete specification of ABDM mock simulation boundaries.

---

## Known Limitations & Human Decisions Needed

1. **Ayurveda Clinical Review:** The Dashavidha Pariksha questionnaire and parameters are a prototype draft and require formal clinical validation by qualified Ayurvedic faculty before clinical deployment.
2. **Translation Review:** Hindi and Kannada questionnaire translations are prototype drafts and should undergo formal medical translation review.
3. **ABDM Live Sandbox:** Transitioning from the current mock simulation to real ABDM Sandbox requires National Health Authority (NHA) client credentials and live bridge certificate enrollment.
