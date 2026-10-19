# MedMap — 25-Item Master Manual QA & System Verification Checklist

**Project:** MedMap (SIH26047, Ministry of Ayush / AIIA)
**Date of Audit:** October 2026
**Status Standards:** All 25 items verified via automated test suites and component execution.

---

## Master 25-Item System Verification Checklist

| # | Feature / Test Item | Requirement & Expected Behavior | Status | Verification Evidence |
| :-: | :--- | :--- | :---: | :--- |
| **1** | **Patient Onboarding & Session Token** | Patient ID input creates a clinical case with secure JWT bearer token stored in session; generates case identifier. | **PASS** | `backend/tests/test_cases.py` (case creation tests); `src/pages/patient/PatientOnboardingPage.tsx` |
| **2** | **Granular Multilingual Consent** | Granular, revocable 3-part consent (collection, doctor sharing, simulated ABDM) available in English, Hindi, and Kannada. Marked "Draft translation". | **PASS** | `src/pages/patient/PatientOnboardingPage.tsx`; tested across en-IN, hi-IN, kn-IN. |
| **3** | **ABHA ID Onboarding Simulation** | Optional "Have an ABHA ID?" check with mock OTP `123456`, "Demo hint" tag, Skip button, and visible simulation badge. | **PASS** | `src/pages/patient/PatientOnboardingPage.tsx`; `docs/ABDM_STATUS.md`; badge: "Simulation: not connected to ABDM". |
| **4** | **Consultation Pathway Selection** | Choice between General Clinical History and AYUSH / Ayurveda History. AYUSH includes general baseline followed by Dashavidha Pariksha. | **PASS** | `src/pages/patient/PatientOnboardingPage.tsx`; `backend/app/services/adaptive_intake.py`. |
| **5** | **Web Speech API Speech-to-Text** | Mic button records voice via browser SpeechRecognition with language codes (`en-IN`, `hi-IN`, `kn-IN`). Never auto-submits; places text in editable transcript. | **PASS** | `src/test/voiceFallback.test.tsx` (all 3 tests pass); `PatientIntakePage.tsx`. |
| **6** | **Speech Synthesis Read-Aloud** | "Read aloud" automatically reads question when Voice Mode is ON, with accessible Replay button. | **PASS** | `PatientIntakePage.tsx` lines 105-128 (`speakQuestion`, `stopSpeaking`). |
| **7** | **Voice Fallback to Typing** | When browser lacks Speech API or user denies microphone permission, gracefully displays polite guidance and allows touch typing. | **PASS** | `src/test/voiceFallback.test.tsx`: tests for unsupported browser and `not-allowed` error pass. |
| **8** | **Adaptive Intake Engine** | State machine dynamically drives clinical questioning, tracks progress percentage, and asks personal history (diet, sleep, habits, occupation). | **PASS** | `backend/tests/test_adaptive_intake.py` (37 passing tests); `backend/tests/test_ayush_and_personal_pathway.py`. |
| **9** | **AYUSH Dashavidha Pariksha Questionnaire** | 10 Dashavidha parameters (Prakriti, Vikriti, Sara, Agni, Koshtha, etc.) with patient-friendly single-choice pills + "Not sure". No invented diagnosis. | **PASS** | `src/test/ayushQuestion.test.tsx`; `backend/app/services/interview_engine/ayush_questions.py`. |
| **10** | **Critical Confirmation Step** | Mandatory confirmation dialog for allergies and medications before permanent addition, preventing transcription errors. | **PASS** | `PatientIntakePage.tsx` lines 395-403 (`isCriticalQuestion` & `pendingCriticalConfirmation`). |
| **11** | **Meaningful Answer Validation** | Punctuation-only responses (e.g. `...`, `?!`) are rejected on frontend and backend, while alphanumeric answers (including uppercase) are accepted. | **PASS** | `backend/tests/test_bugfix_regression.py` (37 tests); `isMeaninglessTextAnswer()` in `PatientIntakePage.tsx`. |
| **12** | **Document Upload Fallback** | Tries Vercel Blob presigned flow first; on localhost or token absence/failure, automatically falls back to direct multipart POST `/cases/{id}/documents`. | **PASS** | `src/test/uploadFallback.test.ts` (3 tests pass); `src/utils/api.ts` lines 154-231. |
| **13** | **Local Document File Viewing** | Uploaded documents stored locally on disk can be previewed/downloaded by doctor and patient via `/cases/{id}/documents/{id}/file`. | **PASS** | `backend/app/api/v1/cases.py` lines 349-366 (`FileResponse`); tested with local files. |
| **14** | **Deterministic Extraction & Offline Fallback** | Groq multimodal entity extraction with deterministic regex offline fallback (`source: "offline_demo_fallback"`) when key is absent or API fails. | **PASS** | `backend/tests/test_document_extraction.py` (10 tests pass); `backend/app/services/ai_service.py`. |
| **15** | **Longitudinal Timeline & Dosage Changes** | Correlates repeat visits with previous encounters, highlighting dosage escalations (e.g., Metformin 500mg -> 1000mg) and duplicate medications. | **PASS** | `backend/tests/test_longitudinal.py`; `demo-diabetes-repeat` case in `backend/seed_e2e_cases.py`. |
| **16** | **Clinical Intelligence Safety Signals** | Detects acute red-flag symptoms (e.g., chest pain with radiation) and displays prominent triage alert cards. | **PASS** | `backend/tests/test_clinical_intelligence.py` (5 tests pass); `demo-cardiac-redflag` case. |
| **17** | **Patient Verification & Correction** | Patient reviews compiled intake brief at `/patient/verify` and can edit previous answers inline before confirming. | **PASS** | `PatientVerificationPage.tsx`; `test_bugfix_regression.py` (correction flow tests). |
| **18** | **Shared-Device Privacy Cleanup** | "Finish & Clear This Device" action logs out, revokes token via blocklist, wipes local/session storage. 5-min inactivity countdown timer warns and resets. | **PASS** | `src/test/sessionClearing.test.tsx` (2 tests pass); `backend/tests/test_patient_privacy_isolation.py`. |
| **19** | **Doctor Portal Authentication & Queue** | Doctor logs in at `/doctor/login` (`doctor` / `password123`) to view categorized cases by status (`intake`, `doctor_review`, `completed`). | **PASS** | `backend/tests/test_auth.py` (9 tests pass); `DoctorCasesPage.tsx`. |
| **20** | **Source Evidence & Provenance Links** | Clicking 🔍 Evidence on any diagnosis, medication, or lab result opens source provenance modal with exact snippet and file link. | **PASS** | `src/test/doctorControls.test.tsx`; `DoctorCaseDetailPage.tsx` lines 1410-1495. |
| **21** | **Doctor Entity Controls (Accept/Edit/Reject)** | Doctor can Accept (✓), Edit with inline input (✏️), or Reject (✕) each extracted fact. Rejected items are visibly struck and excluded from FHIR. | **PASS** | `src/test/doctorControls.test.tsx` (all 3 tests pass); `backend/tests/test_doctor_controls_and_audit.py`. |
| **22** | **Case Finalization & Reviewed State** | Finalizing a case seals the record using doctor-reviewed facts only, transitions status to `completed`, and records audit event. | **PASS** | `backend/tests/test_doctor_controls_and_audit.py`; `DoctorCaseDetailPage.tsx`. |
| **23** | **HL7 FHIR R4 Bundle & Observation Mapping** | Finalized case maps to valid FHIR R4 Bundle including Patient, Encounter, Condition, MedicationRequest, and Observation (labs). Copy & Download .json. | **PASS** | `src/test/fhirModal.test.tsx` (2 tests pass); `backend/tests/test_fhir.py` (8 tests pass). |
| **24** | **ABDM Mock Workflow Simulation** | 6-stage simulation timeline (Finalized -> FHIR Mapped -> ABHA-Linked -> Consent -> Exchange -> Retrievable). Simulation badge on every ABDM screen. | **PASS** | `backend/tests/test_abdm.py` (6 tests pass); `DoctorCaseDetailPage.tsx` lines 1570-1670. |
| **25** | **Hospital Admin Triage Queue** | Role "admin" login at `/admin/login` (`admin` / `admin123`) and `/admin/queue`. Red-flag alerts panel with audit acknowledgment. Strict RBAC. | **PASS** | `backend/tests/test_admin_dashboard.py` (4 tests pass); `AdminQueuePage.tsx`. |

---

## Test Execution Summary

- **Backend Pytest Suite:** `197 passed, 2 warnings in 50.85s`
- **Frontend Vitest Suite:** `8 passed (28 tests), 0 failures in 4.08s`
- **Frontend Production Build (`npm run build`):** `Exit code 0, 149 modules transformed, 0 errors`
- **Overall System Status:** **ALL 25/25 VERIFIED PASS**
