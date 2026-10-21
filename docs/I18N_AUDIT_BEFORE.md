# MedMap i18n Audit Report (Baseline - Before Fixes)
Date: 2026-10-21T15:22:16.782Z

## Executive Summary
This audit inspects all patient-facing surfaces for English leaks when Kannada (`kn`) or Hindi (`hi`) is selected:
- **Dictionary (`src/i18n/strings.ts`)**: 110 English keys total.
  - Missing in Hindi (`hi`): **90** keys
  - Missing in Kannada (`kn`): **90** keys
  - Untranslated/Identical copy in Hindi: **0** keys
  - Untranslated/Identical copy in Kannada: **0** keys
  - Disallowed Latin in Hindi: **1** keys
  - Disallowed Latin in Kannada: **1** keys
- **Frontend Patient Files**: Total **258** leaked UI elements across 13 files.
- **Backend & API Leaks**: Total **52** error strings/untranslated definitions reaching the patient.

---

## 1. Dictionary Coverage (`src/i18n/strings.ts`)

| Metric | Hindi (`hi`) | Kannada (`kn`) |
| :--- | :--- | :--- |
| Missing Keys | 90 | 90 |
| Identical to English (Copy Leak) | 0 | 0 |
| Disallowed Latin Letters | 1 | 1 |

### Missing Keys in Hindi & Kannada
```
landingTitle, landingSubtitle, landingPatientCard, landingDoctorCard, landingAdminCard, aiNotice, onboardingHeading, onboardingSubtitle, patientIdLabel, patientIdPlaceholder, languageLabel, consultationTypeLabel, consultationGeneral, consultationAyush, consultationAyushHint, consultationGeneralHint, startIntakeButton, creatingCase, consentTitle, consent1Label, consent1Text, consent2Label, consent2Text, consent3Label, consent3Text, consentRevocable, abhaToggleLabel, abhaSimBadge, abhaIdLabel, abhaIdPlaceholder, abhaVerifyButton, abhaSkipButton, abhaOtpLabel, abhaOtpHint, abhaConfirmOtp, abhaReEnter, abhaSkipNow, abhaVerified, abhaLinked, abhaChange, intakeHeading, intakeProgress, intakeSaving, intakeFinish, intakeValidationEmpty, intakeValidationMeaningless, intakeClarificationPrompt, micStart, micStop, micReplay, aiTranslationTag, draftTranslationTag, translationUnavailable, confirmModalTitle, confirmModalBody, confirmButton, editButton, safetyTitle, safetySubtitle, safetyActionLabel, safetyRedFlags, safetyContinue, verificationHeading, verificationSubtitle, verificationSubmit, verificationSubmitting, verificationEdit, verificationSave, verificationCancel, documentsHeading, documentsSubtitle, documentsUpload, documentsDone, documentsProcessing, inactivityWarning, inactivityClear, inactivityStay, privacyClearDevice, loading, error, tryAgain, yes, no, cancel, save, edit, submit, back, next, skip
```

---

## 2. Frontend Patient-Facing Leaks

| File | Raw JSX Text | Attributes (`placeholder`, `aria-*`) | Hardcoded Calls (`alert`, `setError`) | Dynamic / Concat | Fallbacks (`|| '...'`) | Total Leaks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/pages/LandingPage.tsx` | 3 | 1 | 0 | 0 | 0 | **4** |
| `src/pages/NotFoundPage.tsx` | 3 | 0 | 0 | 0 | 0 | **3** |
| `src/pages/patient/PatientOnboardingPage.tsx` | 20 | 1 | 5 | 0 | 15 | **41** |
| `src/pages/patient/PatientIntakePage.tsx` | 58 | 17 | 3 | 23 | 2 | **103** |
| `src/pages/patient/PatientDocumentsPage.tsx` | 25 | 2 | 3 | 2 | 0 | **32** |
| `src/pages/patient/PatientVerificationPage.tsx` | 42 | 4 | 0 | 3 | 5 | **54** |
| `src/components/patient/InactivityCountdownBanner.tsx` | 4 | 1 | 0 | 0 | 0 | **5** |
| `src/components/Button.tsx` | 0 | 0 | 0 | 1 | 0 | **1** |
| `src/components/Badge.tsx` | 0 | 1 | 0 | 0 | 0 | **1** |
| `src/components/ErrorMessage.tsx` | 1 | 5 | 0 | 1 | 0 | **7** |
| `src/components/LoadingIndicator.tsx` | 0 | 2 | 0 | 1 | 0 | **3** |
| `src/components/StatusBadge.tsx` | 0 | 0 | 0 | 2 | 0 | **2** |
| `src/components/EmptyState.tsx` | 0 | 1 | 0 | 1 | 0 | **2** |
| **Total** | **156** | **35** | **11** | **34** | **22** | **258** |

### Detailed Leaks by File


### `src/pages/LandingPage.tsx` (4 findings)
- **Line 20** [JSX Text]: `"Patient Entry"`
- **Line 27** [JSX Text]: `"Doctor Login"`
- **Line 39** [JSX Text]: `"🏥 Hospital Admin / Triage Login →"`
- **Line 7** [Attribute text]: `"The project is under development"`





### `src/pages/NotFoundPage.tsx` (3 findings)
- **Line 6** [JSX Text]: `"404 - Page not found"`
- **Line 7** [JSX Text]: `"The page you are looking for does not exist."`
- **Line 9** [JSX Text]: `"Return to Home"`






### `src/pages/patient/PatientOnboardingPage.tsx` (41 findings)
- **Line 147** [JSX Text]: `"Patient Onboarding"`
- **Line 174** [JSX Text]: `"Have an ABHA ID?"`
- **Line 185** [JSX Text]: `"Simulation: not connected to ABDM"`
- **Line 190** [JSX Text]: `"Link your Ayushman Bharat Health Account to simulate ABDM longitudinal health record integration."`
- **Line 204** [JSX Text]: `"ABHA ID / Address:"`
- **Line 222** [JSX Text]: `"Verify"`
- **Line 231** [JSX Text]: `"Skip ABHA / Continue without"`
- **Line 241** [JSX Text]: `"Enter 6-digit OTP:"`
- **Line 244** [JSX Text]: `"Demo hint: 123456"`
- **Line 248** [JSX Text]: `"Simulated verification code sent to mobile linked with ABHA"`
- **Line 265** [JSX Text]: `"Confirm OTP"`
- **Line 274** [JSX Text]: `"← Re-enter ABHA ID"`
- **Line 281** [JSX Text]: `"Skip for now"`
- **Line 290** [JSX Text]: `"✓ ABHA Verified (Simulation)"`
- **Line 292** [JSX Text]: `"Linked"`
- **Line 303** [JSX Text]: `"Change / Disconnect ABHA"`
- **Line 335** [JSX Text]: `"English"`
- **Line 336** [JSX Text]: `"हिंदी (Hindi)"`
- **Line 337** [JSX Text]: `"ಕನ್ನಡ (Kannada)"`
- **Line 418** [JSX Text]: `"Revocability:"`
- **Line 212** [Attribute placeholder]: `"e.g. 14-digit ABHA or user@abdm"`
- **Line 80** [Call setAbhaError]: `"Please enter an ABHA ID (e.g. 14-digit number or name@abdm)"`
- **Line 94** [Call setAbhaError]: `"Verification returned negative result."`
- **Line 105** [Call setAbhaError]: `"Please enter the 6-digit OTP"`
- **Line 109** [Call setAbhaError]: `"Invalid OTP for simulation. Please enter the demo OTP: 123456"`
- **Line 138** [Call setError]: `"Failed to create case. Please try again."`

- **Line 150** [English Fallback]: `"Welcome to MedMap"`
- **Line 151** [English Fallback]: `"Please enter your details to start."`
- **Line 313** [English Fallback]: `"Patient ID"`
- **Line 327** [English Fallback]: `"Preferred Language"`
- **Line 342** [English Fallback]: `"Consultation Type"`
- **Line 350** [English Fallback]: `"General Clinical History"`
- **Line 351** [English Fallback]: `"AYUSH / Ayurveda History"`
- **Line 355** [English Fallback]: `"AYUSH includes general clinical history first, followed by Ayurvedic Dashavidha Pariksha questionnaire."`
- **Line 356** [English Fallback]: `"Standard clinical history: symptoms, medications, allergies, and health background."`
- **Line 372** [English Fallback]: `"Draft translation"`
- **Line 387** [English Fallback]: `"Data Collection:"`
- **Line 400** [English Fallback]: `"Doctor Sharing:"`
- **Line 412** [English Fallback]: `"ABDM Simulation (Optional):"`
- **Line 428** [English Fallback]: `"Creating case..."`
- **Line 428** [English Fallback]: `"Start Intake"`


### `src/pages/patient/PatientIntakePage.tsx` (103 findings)
- **Line 756** [JSX Text]: `"Something went wrong"`
- **Line 759** [JSX Text]: `"Try again"`
- **Line 760** [JSX Text]: `"Back to Home"`
- **Line 773** [JSX Text]: `"Something went wrong"`
- **Line 784** [JSX Text]: `"Try again"`
- **Line 786** [JSX Text]: `"Back to Home"`
- **Line 805** [JSX Text]: `"Welcome Back"`
- **Line 806** [JSX Text]: `"Case"`
- **Line 811** [JSX Text]: `"We have your verified medical information from your previous visit on"`
- **Line 814** [JSX Text]: `"What has changed since your last visit?"`
- **Line 815** [JSX Text]: `"Please tell us about any new symptoms, worsened conditions, or changes in your medications. If nothing has changed for a particular issue, you don't need to re-enter it."`
- **Line 834** [JSX Text]: `"Skip / Start Fresh"`
- **Line 871** [JSX Text]: `"Review Your Medical History"`
- **Line 872** [JSX Text]: `"Case"`
- **Line 877** [JSX Text]: `"Please review the information you have provided below. You can edit any answer or continue to document verification."`
- **Line 892** [JSX Text]: `"Skipped"`
- **Line 898** [JSX Text]: `"Uncertain"`
- **Line 905** [JSX Text]: `"Edit"`
- **Line 925** [JSX Text]: `"Try again"`
- **Line 953** [JSX Text]: `"Urgent Clinical Notice"`
- **Line 955** [JSX Text]: `"Case"`
- **Line 968** [JSX Text]: `"Recommended Action"`
- **Line 974** [JSX Text]: `"Symptoms of Clinical Concern:"`
- **Line 984** [JSX Text]: `"Deterministic clinical safety alert: MedMap pre-consultation intake does not provide emergency treatment or replace an in-person emergency evaluation."`
- **Line 989** [JSX Text]: `"📞 Call Emergency Services (112 / 911)"`
- **Line 998** [JSX Text]: `"Edit My Last Answer"`
- **Line 1006** [JSX Text]: `"Review Answers Recorded So Far"`
- **Line 1020** [JSX Text]: `"Intake Threshold Reached"`
- **Line 1022** [JSX Text]: `"Case"`
- **Line 1027** [JSX Text]: `"Clinical Safeguard Limit"`
- **Line 1029** [JSX Text]: `"We have collected comprehensive background information for your visit."`
- **Line 1032** [JSX Text]: `"To protect the accuracy of your clinical intake and prevent repetitive questions, online questioning has been paused. All information you have provided has been securely preserved and will be reviewed directly by your doctor during your consultation."`
- **Line 1042** [JSX Text]: `"Proceed to Review & Verify Answers →"`
- **Line 1068** [JSX Text]: `"← Back to Home"`
- **Line 1077** [JSX Text]: `"← Previous Question"`
- **Line 1086** [JSX Text]: `"Case"`
- **Line 1105** [JSX Text]: `"English"`
- **Line 1106** [JSX Text]: `"हिंदी (Hindi)"`
- **Line 1107** [JSX Text]: `"ಕನ್ನಡ (Kannada)"`
- **Line 1117** [JSX Text]: `"Voice & Audio Mode"`
- **Line 1119** [JSX Text]: `"Browser-based speech (Web Speech API) &middot;"`
- **Line 1182** [JSX Text]: `"Your Previous Response"`
- **Line 1245** [JSX Text]: `"Suggested Options"`
- **Line 1271** [JSX Text]: `"Suggested Clarifications"`
- **Line 1330** [JSX Text]: `"s remaining. Tap button when finished."`
- **Line 1354** [JSX Text]: `"Listening in"`
- **Line 1354** [JSX Text]: `"... Speak clearly, then review your transcript below."`
- **Line 1365** [JSX Text]: `"🎙️ Speech recognition not supported in this browser. Please use touch or typing below."`
- **Line 1392** [JSX Text]: `"Recognized Voice Answer"`
- **Line 1393** [JSX Text]: `"Edit in the box below if needed"`
- **Line 1404** [JSX Text]: `"Confirm"`
- **Line 1407** [JSX Text]: `"Medicines and allergies are critical to your safety. Please verify what was understood before proceeding:"`
- **Line 1410** [JSX Text]: `"Understood Answer:"`
- **Line 1422** [JSX Text]: `"✓ Confirm This Is Correct"`
- **Line 1433** [JSX Text]: `"✏️ Correct / Edit Answer"`
- **Line 1479** [JSX Text]: `"Try again"`
- **Line 1493** [JSX Text]: `"Skip this question"`
- **Line 1503** [JSX Text]: `"I'm not sure / Unknown"`
- **Line 819** [Attribute placeholder]: `"e.g. My fever is gone but I have a new cough. I started taking cough syrup."`
- **Line 826** [Attribute aria-live]: `"polite"`
- **Line 961** [Attribute aria-hidden]: `"true"`
- **Line 1075** [Attribute aria-label]: `"Go to previous question"`
- **Line 1152** [Attribute aria-label]: `"Clinical Domains Explored"`
- **Line 1176** [Attribute aria-hidden]: `"true"`
- **Line 1317** [Attribute aria-hidden]: `"true"`
- **Line 1329** [Attribute aria-live]: `"polite"`
- **Line 1349** [Attribute aria-hidden]: `"true"`
- **Line 1353** [Attribute aria-live]: `"polite"`
- **Line 1390** [Attribute aria-live]: `"polite"`
- **Line 1401** [Attribute aria-modal]: `"true"`
- **Line 1403** [Attribute aria-hidden]: `"true"`
- **Line 1450** [Attribute placeholder]: `"Type your response here..."`
- **Line 1464** [Attribute placeholder]: `"Type your response here..."`
- **Line 1501** [Attribute title]: `"Indicate uncertainty without penalty"`
- **Line 1508** [Attribute aria-live]: `"polite"`
- **Line 625** [Call setValidationError]: `"Please describe your answer using words or numbers so your care team can understand."`
- **Line 722** [Call setError]: `"Failed to confirm your answers. Please try again."`
- **Line 840** [Call setValidationError]: `"Please describe your answer using words or numbers so your care team can understand."`
- **Line 818** [Dynamic String]: `"`intake-textarea${validationError ? ' intake-input--error' : ''}`"`
- **Line 1124** [Dynamic String]: `"`intake-voice-toggle-btn ${voiceMode ? 'intake-voice-toggle-btn--active' : ''}`"`
- **Line 1149** [Dynamic String]: `"`${progressPercent}%`"`
- **Line 1167** [Dynamic String]: `"`intake-question-card ${state === 'clarification' ? 'intake-clarification-card' : ''}`"`
- **Line 1203** [Dynamic String]: `"`intake-btn-read-aloud ${isSpeaking ? 'intake-btn-read-aloud--speaking' : ''}`"`
- **Line 1210** [Dynamic String]: `"`⏳ ${t('audioLoading')}`"`
- **Line 1210** [Dynamic String]: `"`⏹ ${t('stopAudio')}`"`
- **Line 1210** [Dynamic String]: `"`🔊 ${t('readAloud')}`"`
- **Line 1237** [Dynamic String]: `"`helper-${currentQuestion.id}`"`
- **Line 1256** [Dynamic String]: `"`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`"`
- **Line 1282** [Dynamic String]: `"`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`"`
- **Line 1299** [Dynamic String]: `"`intake-mic-btn ${micRecordState === 'recording' ? 'intake-mic-btn--listening' : ''}`"`
- **Line 1313** [Dynamic String]: `"`${t('micTapToSpeak')} (${speechLangName})`"`
- **Line 1322** [Dynamic String]: `"`${t('micRecording')} (${30 - recordingSeconds}s)`"`
- **Line 1325** [Dynamic String]: `"`${t('micTapToSpeak')} (${speechLangName})`"`
- **Line 1343** [Dynamic String]: `"`intake-mic-btn ${isListening ? 'intake-mic-btn--listening' : ''}`"`
- **Line 1350** [Dynamic String]: `"`Tap to Speak (${speechLangName})`"`
- **Line 1442** [Dynamic String]: `"`intake-${currentQuestion.id}`"`
- **Line 1443** [Dynamic String]: `"`intake-textarea${validationError ? ' intake-input--error' : ''}`"`
- **Line 1447** [Dynamic String]: `"`helper-${currentQuestion.id}`"`
- **Line 1456** [Dynamic String]: `"`intake-${currentQuestion.id}`"`
- **Line 1457** [Dynamic String]: `"`intake-input${validationError ? ' intake-input--error' : ''}`"`
- **Line 1461** [Dynamic String]: `"`helper-${currentQuestion.id}`"`
- **Line 1083** [English Fallback]: `"Medical History"`
- **Line 1090** [English Fallback]: `"Language"`


### `src/pages/patient/PatientDocumentsPage.tsx` (32 findings)
- **Line 161** [JSX Text]: `"Document Upload"`
- **Line 163** [JSX Text]: `"Home"`
- **Line 164** [JSX Text]: `"Intake"`
- **Line 165** [JSX Text]: `"Next: Verification"`
- **Line 172** [JSX Text]: `"Step 2 of 3"`
- **Line 172** [JSX Text]: `"Patient Document Intake"`
- **Line 176** [JSX Text]: `"Active Case:"`
- **Line 184** [JSX Text]: `"Upload Medical Documents"`
- **Line 187** [JSX Text]: `"Upload your past lab reports, hospital discharge summaries, or diagnostic records to assist your doctor during your consultation."`
- **Line 236** [JSX Text]: `"Drag & drop your file here, or click to browse your computer"`
- **Line 241** [JSX Text]: `"Supported: PDF, JPG, PNG, WEBP • Max 10 MB (Large images are automatically optimized)"`
- **Line 253** [JSX Text]: `"📁 Choose File"`
- **Line 266** [JSX Text]: `"Skip & Continue to Verification →"`
- **Line 284** [JSX Text]: `"Type:"`
- **Line 292** [JSX Text]: `"● Ready to process"`
- **Line 297** [JSX Text]: `"Processing..."`
- **Line 302** [JSX Text]: `"✓ Document ready"`
- **Line 320** [JSX Text]: `"Upload & Extraction Complete"`
- **Line 322** [JSX Text]: `"Document uploaded securely and AI-assisted extraction is complete. Details will be reviewed by your doctor."`
- **Line 337** [JSX Text]: `"⚙️ Upload Document"`
- **Line 345** [JSX Text]: `"🗑️ Remove File"`
- **Line 363** [JSX Text]: `"Next: Go to Verification ➔"`
- **Line 371** [JSX Text]: `"🔄 Upload Another Document"`
- **Line 381** [JSX Text]: `"MedMap Processing Notice:"`
- **Line 381** [JSX Text]: `"Documents are securely uploaded and processed using AI-assisted extraction. Extracted information is not a diagnosis and requires doctor review."`
- **Line 207** [Attribute aria-label]: `"Choose medical document file to upload"`
- **Line 221** [Attribute aria-label]: `"Medical document drag and drop area. Click or press Enter to select a file."`
- **Line 119** [Call setError]: `"No active case ID found. Please restart intake."`
- **Line 125** [Call setProcessingMessage]: `"Uploading securely to server... Please wait."`
- **Line 132** [Call setProcessingMessage]: `"Extracting medical details... This may take up to 30 seconds."`
- **Line 213** [Dynamic String]: `"`doc-dropzone ${dragActive ? 'drag-active' : ''}`"`
- **Line 276** [Dynamic String]: `"`doc-file-icon ${getFileBadgeType(selectedFile.name).toLowerCase()}`"`



### `src/pages/patient/PatientVerificationPage.tsx` (54 findings)
- **Line 190** [JSX Text]: `"Something went wrong"`
- **Line 194** [JSX Text]: `"Try Again"`
- **Line 197** [JSX Text]: `"Back to Home"`
- **Line 237** [JSX Text]: `"← Back to Home"`
- **Line 243** [JSX Text]: `"Case"`
- **Line 255** [JSX Text]: `"Patient Identifier"`
- **Line 260** [JSX Text]: `"Preferred Language"`
- **Line 265** [JSX Text]: `"Data Sharing Consent"`
- **Line 286** [JSX Text]: `"AI assists, your doctor decides:"`
- **Line 286** [JSX Text]: `"MedMap organizes your reported symptoms and records to assist the physician. AI does not produce diagnoses. Your doctor makes all clinical decisions."`
- **Line 293** [JSX Text]: `"Your Responses"`
- **Line 295** [JSX Text]: `"active question"`
- **Line 295** [JSX Text]: `"recorded"`
- **Line 329** [JSX Text]: `"Provided"`
- **Line 333** [JSX Text]: `"Skipped"`
- **Line 340** [JSX Text]: `"Clarified"`
- **Line 347** [JSX Text]: `"Corrected"`
- **Line 354** [JSX Text]: `"Uncertain"`
- **Line 376** [JSX Text]: `"Edit your response:"`
- **Line 422** [JSX Text]: `"(No answer provided)"`
- **Line 431** [JSX Text]: `"No responses recorded."`
- **Line 438** [JSX Text]: `"Inactive Branch History (Audit Trail)"`
- **Line 441** [JSX Text]: `"were previously answered but excluded because earlier answers (such as allergy status) were changed."`
- **Line 450** [JSX Text]: `"Attached Documents"`
- **Line 452** [JSX Text]: `"document"`
- **Line 457** [JSX Text]: `"Review medical records, reports, or files attached to this case."`
- **Line 522** [JSX Text]: `"Open File ↗"`
- **Line 525** [JSX Text]: `"Attached"`
- **Line 534** [JSX Text]: `"No documents are currently attached to this case."`
- **Line 542** [JSX Text]: `"Verification Review Summary"`
- **Line 547** [JSX Text]: `"Provided"`
- **Line 551** [JSX Text]: `"Skipped"`
- **Line 555** [JSX Text]: `"Edited in Session"`
- **Line 559** [JSX Text]: `"Documents"`
- **Line 575** [JSX Text]: `"Information Verified"`
- **Line 576** [JSX Text]: `"Your responses have been confirmed and sent to the doctor for review."`
- **Line 594** [JSX Text]: `"🛡️ Finish & Clear This Device"`
- **Line 597** [JSX Text]: `"View Doctor Dashboard (Demo) →"`
- **Line 601** [JSX Text]: `"Clearing the device safely logs out, revokes the active token, and removes local data for the next patient."`
- **Line 607** [JSX Text]: `"Ready to Confirm?"`
- **Line 610** [JSX Text]: `"By clicking below, you confirm that you have reviewed the intake responses and attached documents above, and that the information accurately represents what you provided."`
- **Line 615** [JSX Text]: `"Please save or cancel your open response edit before confirming."`
- **Line 364** [Attribute aria-label]: `"`Edit response for "${question}"`"`
- **Line 386** [Attribute placeholder]: `"Type your response here..."`
- **Line 494** [Attribute aria-hidden]: `"true"`
- **Line 574** [Attribute aria-hidden]: `"true"`

- **Line 375** [Dynamic String]: `"`edit-input-${index}`"`
- **Line 379** [Dynamic String]: `"`edit-input-${index}`"`
- **Line 502** [Dynamic String]: `"`• Uploaded ${formattedDate}`"`
- **Line 241** [English Fallback]: `"Verify Your Information"`
- **Line 251** [English Fallback]: `"Please review the information you provided below. You can correct any response before confirming. This information will be shared with the reviewing physician. This is not an automated diagnosis."`
- **Line 367** [English Fallback]: `"Edit"`
- **Line 403** [English Fallback]: `"Cancel"`
- **Line 413** [English Fallback]: `"Save Response"`


### `src/components/patient/InactivityCountdownBanner.tsx` (5 findings)
- **Line 94** [JSX Text]: `"Shared Device Inactivity Warning ("`
- **Line 97** [JSX Text]: `"To protect your medical privacy on shared kiosks, this session will reset and clear all data."`
- **Line 116** [JSX Text]: `"Keep Working"`
- **Line 132** [JSX Text]: `"Clear Device Now"`
- **Line 69** [Attribute aria-live]: `"assertive"`





### `src/components/Button.tsx` (1 findings)



- **Line 64** [Dynamic String]: `"`medmap-btn ${className}`"`



### `src/components/Badge.tsx` (1 findings)

- **Line 17** [Attribute aria-hidden]: `"true"`





### `src/components/ErrorMessage.tsx` (7 findings)
- **Line 74** [JSX Text]: `"Retry"`
- **Line 21** [Attribute aria-live]: `"assertive"`
- **Line 47** [Attribute aria-hidden]: `"true"`
- **Line 61** [Attribute aria-label]: `"Retry action"`
- **Line 83** [Attribute aria-label]: `"Dismiss error"`
- **Line 106** [Attribute aria-hidden]: `"true"`

- **Line 22** [Dynamic String]: `"`error-message ${className}`"`



### `src/components/LoadingIndicator.tsx` (3 findings)

- **Line 15** [Attribute aria-live]: `"polite"`
- **Line 32** [Attribute aria-hidden]: `"true"`

- **Line 16** [Dynamic String]: `"`loading-indicator ${className}`"`



### `src/components/StatusBadge.tsx` (2 findings)



- **Line 53** [Dynamic String]: `"`status-badge ${className}`"`
- **Line 62** [Dynamic String]: `"`1.5px solid ${config.borderColor}`"`



### `src/components/EmptyState.tsx` (2 findings)

- **Line 40** [Attribute aria-hidden]: `"true"`

- **Line 23** [Dynamic String]: `"`medmap-empty-state ${className}`"`



---

## 3. Backend & API Leaks Reaching Patient

| File | Line | Type | Sample Message |
| :--- | :--- | :--- | :--- |
| `src/utils/api.ts` | 41 | API Throw Error | `Failed to create case` |
| `src/utils/api.ts` | 73 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 95 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 126 | API Throw Error | `Failed to update case` |
| `src/utils/api.ts` | 266 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 269 | API Throw Error | `Failed to load cases` |
| `src/utils/api.ts` | 281 | API Throw Error | `Failed to load case documents` |
| `src/utils/api.ts` | 293 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 296 | API Throw Error | `Failed to load clinical intelligence` |
| `src/utils/api.ts` | 307 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 310 | API Throw Error | `Failed to load unified case` |
| `src/utils/api.ts` | 322 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 357 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 377 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 502 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 505 | API Throw Error | `Failed to load admin queue` |
| `src/utils/api.ts` | 520 | API Throw Error | `Failed to acknowledge alert` |
| `backend/app/api/v1/cases.py` | 24 | Backend HTTPException | `Explicit consent is required to create a case` |
| `backend/app/api/v1/cases.py` | 43 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 46 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 59 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 63 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 161 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 173 | Backend HTTPException | `Not authorized to update this case` |
| `backend/app/api/v1/cases.py` | 175 | Backend HTTPException | `Patients cannot mark case as completed` |
| `backend/app/api/v1/cases.py` | 178 | Backend HTTPException | `Patients cannot modify doctor review fields` |
| `backend/app/api/v1/cases.py` | 420 | Backend HTTPException | `Not authorized to upload to this case` |
| `backend/app/api/v1/cases.py` | 436 | Backend HTTPException | `Invalid metadata format` |
| `backend/app/api/v1/cases.py` | 443 | Backend HTTPException | `Must provide file or metadata` |
| `backend/app/api/v1/cases.py` | 448 | Backend HTTPException | `Not authorized to access these documents` |
| `backend/app/api/v1/cases.py` | 451 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 483 | Backend HTTPException | `Operation not permitted` |
| `backend/app/api/v1/cases.py` | 485 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 506 | Backend HTTPException | `Document not found` |
| `backend/app/api/v1/cases.py` | 512 | Backend HTTPException | `Document file not found on disk` |
| `backend/app/api/v1/cases.py` | 529 | Backend HTTPException | `Not authorized to access this document` |
| `backend/app/api/v1/cases.py` | 542 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 546 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 553 | Backend HTTPException | `Cannot generate AI summary: intake answers are empty` |
| `backend/app/api/v1/cases.py` | 561 | Backend HTTPException | `AI generated malformed response` |
| `backend/app/api/v1/cases.py` | 565 | Backend HTTPException | `AI Generation Failed` |
| `backend/app/api/v1/cases.py` | 567 | Backend HTTPException | `An unexpected error occurred during AI generation` |
| `backend/app/api/v1/cases.py` | 571 | Backend HTTPException | `Case not found during update` |
| `backend/app/api/v1/cases.py` | 582 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 586 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 615 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 619 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 636 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 642 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 669 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 723 | Backend HTTPException | `Case not found` |
| `backend/app/services/interview_engine/ayush_questions.py` | 1 | AYUSH Questions Untranslated in Engine | `14 questions defined only in English` |

---
