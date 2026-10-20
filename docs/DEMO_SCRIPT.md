# MedMap Demo Script (SIH26047, Ministry of Ayush / AIIA)

**Platform:** MedMap AI Pre-Consultation Patient Case-Taking Platform
**LLM / Vision Provider:** Groq Cloud (configured model `openai/gpt-oss-120b`, configurable via `GROQ_MODEL`) with deterministic offline rule-based fallback
**ABDM Status:** Clearly labeled Mock / Simulation (`Simulation: not connected to ABDM`)
**AYUSH Questionnaire:** Draft questionnaire (requires review by a qualified Ayurvedic practitioner)
**Speech:** Server-side Sarvam AI (`bulbul:v3` TTS, `saaras:v4` STT with Groq Whisper fallback) for Kannada/Hindi; Web Speech API for English

---

## Quick Demo Credentials & Seeding

Before running the demo script, ensure the database is seeded:
```bash
# In backend/
python seed_e2e_cases.py
```
This idempotently provisions:
- **Doctor Portal:** `doctor` / `password123`
- **Admin Dashboard:** `admin` / `admin123`
- **Patient Portal:** `patient` / `password123`
- **Pre-seeded Cases:**
  - `demo-cardiac-redflag`: General pathway with acute chest-pain red flag
  - `demo-diabetes-repeat`: Longitudinal repeat visit with Metformin dosage escalation & attached lab/Rx PDFs
  - `demo-ayush-history`: AYUSH pathway with self-reported Dashavidha Pariksha observations

---

## 16-Step End-to-End Walkthrough

### Step 1: Patient Opens Landing Page
- Navigate to `http://localhost:5173/` (or Vercel root URL).
- **Observe:** High-contrast, clean healthcare presentation system with deep navy, teal accents, and clear role cards:
  - *Patient Pre-Consultation Intake*
  - *Doctor Clinical Review Portal*
  - *Hospital Admin Triage Queue*
- Notice the visible disclaimer: *"AI assists, your doctor decides. AI does not produce diagnoses."*

### Step 2: Language Selection & Granular Privacy Consent
- Click **"Start Patient Intake"** (`/patient`).
- Select preferred language: **English**, **हिंदी (Hindi)**, or **ಕನ್ನಡ (Kannada)**.
  - Notice translation status badge: `Draft translation`.
- Review the 3 granular, revocable consent checkboxes:
  1. *Consent to collect clinical history and medical documents*
  2. *Consent to share compiled clinical summary with reviewing physician*
  3. *Consent to simulate ABDM health record exchange (Clearly labeled simulation)*
- **Action:** Check the consents and enter Patient ID (e.g. `P-201`) or keep the pre-filled ID.

### Step 3: Optional ABHA ID Verification (Simulation)
- In the onboarding form, review the optional **"Have an ABHA Address / ID?"** section.
- **Notice Badge:** Visible badge `Simulation: not connected to ABDM`.
- Enter an ABHA ID (e.g. `patient@abdm`) and click **Verify ABHA**.
- The simulated OTP dialog appears with a demo hint: `Demo Hint: Enter test OTP 123456`.
- Enter `123456` and confirm, or click **Skip for New Patient** to proceed directly.

### Step 4: Consultation Pathway Selection (General vs AYUSH)
- Choose the consultation pathway:
  - **General Clinical History:** Comprehensive allopathic pre-consultation covering chief complaint, duration, past history, medications, allergies, and personal lifestyle.
  - **AYUSH / Ayurveda History:** Includes general history baseline, followed by the 10 Dashavidha Pariksha parameters (Prakriti, Vikriti, Agni, Koshtha, Sara, etc.).
- Notice label: `Draft questionnaire: requires review by a qualified Ayurvedic practitioner.`
- Click **Continue to Medical Intake →**.

### Step 5: Voice & Touch Intake (Web Speech API)
- On the adaptive intake screen (`/patient/intake`), notice the **Voice & Audio Mode** bar.
- Toggle **🔊 Voice Mode: ON**.
- The question is automatically read aloud using browser `SpeechSynthesis`. Click **🔊 Read Aloud / Replay** to repeat.
- Click **🎙️ Tap to Speak** to dictate an answer in the selected language (`en-IN`, `hi-IN`, or `kn-IN`).
- **Touch Correction:** Speech output is placed into an editable transcript. The patient can edit words via touch/keyboard before submitting.
- *Graceful Fallback:* If mic permissions are blocked or unsupported, the interface shows a polite notice and switches seamlessly to touch typing without crashing.

### Step 6: Dynamic Adaptive Clinical Questions
- Answer the chief complaint (e.g. `"Severe acidity, heartburn, and burning in chest for 3 months"`).
- The adaptive intake state machine dynamically selects follow-up questions based on patient answers.
- If an AYUSH pathway was chosen, Dashavidha Pariksha questions are presented with single-choice pills (e.g., Pitta/Vata profiles, Tikshnagni/Mandagni) plus an `"I'm not sure / Unknown"` button.
- Never guess missing information: unknown data stays `"Unknown"`.

### Step 7: Critical Confirmation Step (Medicines & Allergies)
- When answering critical domains (Allergies or Active Medications), a confirmation modal/dialog appears.
- Displays: *"Please confirm what was understood: [e.g. Penicillin allergy - severe hives]"*.
- Patient explicitly clicks **✓ Confirm** or **✏️ Correct** before the entry is permanently registered.

### Step 8: Document Upload with Automatic Fallback
- Navigate to document upload step (`/patient/documents`).
- Drag-and-drop or choose a medical record file:
  - `backend/demo_documents/demo_prescription.pdf` (sample safe prescription)
  - `backend/demo_documents/demo_lab_report.pdf` (sample lab report)
  - Photo scan (`.jpg` / `.png` / `.webp`)
- **Resilience:** The frontend tries Vercel Blob presigned upload first. If Vercel env keys are missing or when on localhost, it automatically falls back to direct multipart POST to `/api/v1/cases/{caseId}/documents`.

### Step 9: Deterministic Document Extraction & Offline Fallback
- Click **Extract Details**.
- Groq Cloud multimodal vision/LLM extracts:
  - Diagnoses & conditions
  - Prescribed medications (name, dose, frequency, route)
  - Lab investigations (test name, value, unit, reference range)
- **Backup Path (Offline Fallback):** If `GROQ_API_KEY` is unset or Groq times out, the backend deterministic regex fallback activates (`source: "offline_demo_fallback"`). In the doctor view, a small tag `Demo fallback used` appears, ensuring the demo never halts.

### Step 10: Longitudinal Timeline & Clinical Intelligence Highlights
- The system correlates current intake with previous verified records.
- For repeat visits (e.g. `demo-diabetes-repeat`):
  - Highlights medication dosage changes (e.g. Metformin escalated from 500mg to 1000mg BD).
  - Safety alerts flag potential drug duplicates or conflicting entries.
  - Critical red flags (e.g., acute cardiac symptoms in `demo-cardiac-redflag`) are prominently highlighted in amber/red alert panels.

### Step 11: Unified Case Review & Patient Verification
- On the verification page (`/patient/verify`), the patient reviews the unified intake summary.
- The patient can click **Edit** on any individual response to modify text inline.
- Click **"I Confirm This Information is Accurate"**.
- Status transitions to `doctor_review`.
- Shared device privacy: Patient can click **"🛡️ Finish & Clear This Device"** to log out, revoke the JWT token, clear local/session storage, and return to a clean landing page for the next patient.

### Step 12: Doctor Portal Access & Case List
- Log in to the Doctor Portal (`/doctor/login`) using:
  - Username: `doctor`
  - Password: `password123`
- The Cases Dashboard (`/doctor/cases`) displays active cases categorized by status:
  - `demo-cardiac-redflag` (Cardiac red-flag triage case)
  - `demo-diabetes-repeat` (Diabetes longitudinal repeat case)
  - `demo-ayush-history` (AYUSH / Ayurveda case)

### Step 13: Clinical Evidence & Source Provenance Links
- Open `demo-diabetes-repeat` or `demo-ayush-history`.
- In the **Extracted Medical Entities** card, each diagnosis, medication, and lab result features a **🔍 Evidence** button.
- Click **🔍 Evidence**:
  - Opens the **Source Evidence & Provenance** modal.
  - Displays the exact extracted text snippet, source document reference, page location, or self-reported intake quote.
  - Doctor can click **📄 Open Original Document File ↗** to view the underlying uploaded PDF/image.

### Step 14: Doctor Decision Controls (Accept, Edit, Reject)
- Physicians have per-item control over extracted facts:
  - **✓ Accept:** Confirms the fact; displays green `✓ Accepted` tag and records doctor acceptance.
  - **✏️ Edit:** Doctor corrects the dosage or spelling; displays `✏️ Edited by Doctor` tag with strikethrough of the original raw text.
  - **✕ Reject:** Rejects a false or erroneous fact; strikes through and excludes it from the final FHIR clinical record.
- Decisions are persistently recorded in the clinical audit trail.

### Step 15: Case Finalization & FHIR Bundle Viewer
- Scroll to the physician assessment panel: enter clinical advice/notes and click **✓ Mark as Completed**.
- The top-bar button **📦 FHIR Bundle** is now unlocked.
- Click **📦 FHIR Bundle**:
  - Opens the **HL7 FHIR R4 Clinical Bundle** modal.
  - Summary chips display exact resource counts: `Patient: 1`, `Encounter: 1`, `Condition: N`, `MedicationRequest: N`, `Observation: N` (from extracted lab investigations).
  - Review the formatted, syntax-highlighted FHIR R4 JSON.
  - Click **Copy JSON** (copies to clipboard) or **Download .json** (downloads `fhir-bundle-<caseId>.json`).

### Step 16: ABDM Mock Workflow Simulation
- In the completed case view, click **🔗 Share to ABDM (simulation)**.
- **Notice Banner:** `Simulation: not connected to ABDM. No live health network calls are executed.`
- Review the granular, revocable patient consent terms:
  - *Context Linking Authorization*
  - *Clinical FHIR Bundle Exchange*
- Click **Authorize Simulated Share**.
- The 6-step ABDM exchange timeline animates through:
  1. `1. Finalized` (Physician signed)
  2. `2. FHIR Mapped` (Compliant bundle generated)
  3. `3. ABHA-Linked` (Context bound to simulated ABHA address)
  4. `4. Consent` (Patient revocable authorization recorded)
  5. `5. Exchange (Simulated)` (Payload validated against ABDM M3 schemas)
  6. `6. Retrievable at Next Visit` (Simulated longitudinal availability)

### Step 17: Multilingual Patient Intake & Doctor Bilingual View (Kannada Walkthrough)

#### Patient-Side Experience (Kannada)
1. **Onboarding:**
   - Go to `http://localhost:5173/patient/onboarding`.
   - Enter Patient ID `P-KN-01` and select **Preferred Language: "Kannada (ಕನ್ನಡ)"**.
   - Notice the localized onboarding heading (*"MedMap ಗೆ ಸುಸ್ವಾಗತ"*), consent terms, and ABHA simulation notices.
   - Click **"ಪ್ರಶ್ನಾವಳಿ ಪ್ರಾರಂಭಿಸಿ" (Start Intake)**.
2. **Adaptive Questionnaire in Kannada:**
   - Notice the category header (*ಮುಖ್ಯ ದೂರು*), question prompt (*ಇಂದು ನೀವು ವೈದ್ಯರನ್ನು ಭೇಟಿ ಮಾಡಲು ಕಾರಣವೇನು?*), and helper text (*ನಿಮ್ಮ ಮುಖ್ಯ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ.*).
   - A subtle badge indicates: `🤖 AI ಅನುವಾದ, ದೋಷಗಳಿರಬಹುದು` (AI translation notice).
   - If device TTS lacks a Kannada voice, a polite notice appears: *"ಸಾಧನದಲ್ಲಿ ಕನ್ನಡ ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ"* and the audio button is gracefully disabled with tooltip, preventing English speech mismatch.
   - Enter response in Kannada (e.g. `ಮೂರು ದಿನಗಳಿಂದ ತೀವ್ರ ಜ್ವರ ಮತ್ತು ಮೈಕೈ ನೋವು`) or select suggested Kannada choice pills.
   - Advance through questions (*ರೋಗಲಕ್ಷಣಗಳ ಅವಧಿ*, *ಔಷಧ ಅಲರ್ಜಿಗಳು*).
3. **Verification Page:**
   - The summary table displays the patient's original Kannada statements.
   - Click **✏️ ತಿದ್ದುಪಡಿ (Edit)** to modify an answer in Kannada.
   - Click **ಖಚಿತಪಡಿಸಿ ಸಲ್ಲಿಸಿ (Confirm & Submit)**.

#### Doctor-Side Experience (Bilingual Inspection)
1. **Login:**
   - Log in at `http://localhost:5173/login` with `doctor` / `password123`.
2. **Open Kannada Case:**
   - Select case `demo-kannada-fever` from the Doctor Case Queue.
3. **Canonical English Review:**
   - The clinical summary, safety red flags, and derived diagnoses appear in canonical clinical English (*"High fever with chills and severe body ache for 3 days"*).
4. **Bilingual Toggle:**
   - In the top action bar, click **"Patient's Language (kn)"**.
   - The patient's reported answers switch dynamically to show the original Kannada utterance (*"ಮೂರು ದಿನಗಳಿಂದ ಚಳಿ ಮತ್ತು ತೀವ್ರ ಮೈಕೈ ನೋವಿನೊಂದಿಗೆ ತೀವ್ರ ಜ್ವರ"*).
5. **Side-by-Side Evidence Inspection:**
   - Click **🔍 Evidence** next to the symptom or chief complaint.
   - The Evidence Modal presents both the English clinical interpretation and the original patient utterance in Kannada side-by-side.
6. **FHIR Export Integrity:**
   - Click **📦 FHIR Bundle**. The generated FHIR bundle encodes clinical concepts in English with original patient text preserved as annotations/extensions.

---

## Offline / Demo Fallback Mode (Resilience Path)

If Groq API service is unavailable, internet connectivity drops, or `GROQ_API_KEY` is not configured:
1. All intake questions continue to adapt and collect responses deterministically via the Python policy engine.
2. Translation service automatically uses deterministic offline caching and bilingual fallbacks; English UI displays with an informative notice if translation is unreachable.
3. Document extraction automatically activates `source: "offline_demo_fallback"`, parsing standard prescriptions and lab values via deterministic regex.
4. The doctor UI displays a small tag: `Demo fallback used`, ensuring zero crashes and full transparency during presentations.
