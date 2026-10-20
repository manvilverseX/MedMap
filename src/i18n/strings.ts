/**
 * MedMap i18n – minimal dictionary-based localisation for patient-facing UI.
 *
 * Design:
 *  - English is the source of truth (hard-coded here).
 *  - For hi/kn the frontend calls POST /api/v1/translate/ui once after language
 *    selection, caches the result in sessionStorage, and re-renders via useT().
 *  - While loading, English text is shown (no blocking spinner > 2 s).
 *  - Changing language mid-intake triggers a re-fetch without losing answers.
 */

export type LangCode = "en" | "hi" | "kn";

// ── English source strings ─────────────────────────────────────────────────────
// Every patient-visible UI string lives here.  Never hard-code strings in JSX
// without a matching key here so translations stay complete.

export const EN_STRINGS = {
  // Landing
  landingTitle: "MedMap",
  landingSubtitle: "AI Pre-Consultation Case-Taking",
  landingPatientCard: "Start Patient Intake",
  landingDoctorCard: "Doctor Clinical Review",
  landingAdminCard: "Hospital Admin Triage",
  aiNotice: "AI assists, your doctor decides. AI does not produce diagnoses.",

  // Onboarding
  onboardingHeading: "Welcome to MedMap",
  onboardingSubtitle: "Please enter your details to start.",
  patientIdLabel: "Patient ID",
  patientIdPlaceholder: "e.g. p-12345",
  languageLabel: "Preferred Language",
  consultationTypeLabel: "Consultation Type",
  consultationGeneral: "General Clinical History",
  consultationAyush: "AYUSH / Ayurveda History",
  consultationAyushHint:
    "AYUSH includes general clinical history first, followed by Ayurvedic Dashavidha Pariksha questionnaire.",
  consultationGeneralHint:
    "Standard clinical history: symptoms, medications, allergies, and health background.",
  startIntakeButton: "Start Intake",
  creatingCase: "Creating case...",

  // Consent
  consentTitle: "Granular Data Sharing Consent",
  consent1Label: "Data Collection:",
  consent1Text:
    "I consent to MedMap collecting my health responses and medical documents to prepare my clinical history. Voice recordings and audio, when used, are processed securely by an AI service.",
  consent2Label: "Doctor Sharing:",
  consent2Text:
    "I consent to sharing my organized clinical history with treating physicians for medical consultation.",
  consent3Label: "ABDM Simulation (Optional):",
  consent3Text:
    "I consent to simulated ABDM care-context exchange (optional, mock mode).",
  consentRevocable:
    "You may revoke your consent or request your session data to be cleared at any time.",

  // ABHA
  abhaToggleLabel: "Have an ABHA ID?",
  abhaSimBadge: "Simulation: not connected to ABDM",
  abhaIdLabel: "ABHA ID / Address:",
  abhaIdPlaceholder: "e.g. 14-digit ABHA or user@abdm",
  abhaVerifyButton: "Verify",
  abhaSkipButton: "Skip ABHA / Continue without",
  abhaOtpLabel: "Enter 6-digit OTP:",
  abhaOtpHint: "Demo hint: 123456",
  abhaConfirmOtp: "Confirm OTP",
  abhaReEnter: "← Re-enter ABHA ID",
  abhaSkipNow: "Skip for now",
  abhaVerified: "✓ ABHA Verified (Simulation)",
  abhaLinked: "Linked",
  abhaChange: "Change / Disconnect ABHA",

  // Intake page
  intakeHeading: "Patient Intake",
  intakeProgress: "Question {{index}} of {{total}}",
  intakeVoiceMode: "Voice Mode",
  intakeTypeMode: "Type Mode",
  intakeSkip: "Skip this question",
  intakeNext: "Save & Continue",
  intakeSaving: "Saving...",
  intakeBack: "← Back",
  intakeFinish: "Finish Intake",
  intakeValidationEmpty: "Please provide an answer before continuing.",
  intakeValidationMeaningless:
    "Please enter a meaningful answer (not just punctuation or symbols).",
  intakeClarificationPrompt: "Could you clarify?",
  micStart: "Start speaking",
  micStop: "Stop",
  micReplay: "Replay question",
  readAloud: "Read Aloud",
  stopAudio: "Stop",
  audioLoading: "Loading audio...",
  audioPlaying: "Playing audio...",
  audioUnavailable:
    "Audio is unavailable right now. Please read the question on screen.",
  micTapToSpeak: "Tap to Speak",
  micRecording: "Recording ({{seconds}}s)... Tap to Stop",
  micTranscribing: "Transcribing audio...",
  micTranscriptionNotice:
    "AI transcription - please check and correct before continuing.",
  micServiceError:
    "Speech recognition service error. Please use touch or typing below.",
  micNoDevice:
    "No microphone found on this device. Please type your answer.",
  micNoSupport:
    "Microphone not supported in this browser. Please type your answer.",
  micDenied:
    "Microphone permission denied. You can continue by typing or choosing options below.",
  micNoSpeech: "No speech detected. Please try again.",
  noVoiceForLang:
    "Audio is unavailable right now. Please read the question on screen.",
  aiTranslationTag: "AI translation, may contain errors.",
  draftTranslationTag: "Draft translation",
  translationUnavailable:
    "Translation unavailable, showing English.",

  // Confirmation modal
  confirmModalTitle: "Please confirm your answer",
  confirmModalBody:
    "You mentioned {{category}}. This information is critical. Please confirm it is accurate before we continue.",
  confirmButton: "Yes, this is accurate",
  editButton: "Let me edit",

  // Safety escalation
  safetyTitle: "Important — Please seek medical attention",
  safetySubtitle: "Based on what you've described, we recommend you seek care promptly.",
  safetyActionLabel: "Recommended action:",
  safetyRedFlags: "Symptoms that prompted this notice:",
  safetyContinue: "I understand — Continue intake anyway",

  // Verification
  verificationHeading: "Review Your Answers",
  verificationSubtitle:
    "Please review the information you provided. You can edit any answer before submitting to your doctor.",
  verificationSubmit: "Submit for Doctor Review",
  verificationSubmitting: "Submitting...",
  verificationEdit: "Edit",
  verificationSave: "Save",
  verificationCancel: "Cancel",

  // Documents
  documentsHeading: "Upload Medical Documents",
  documentsSubtitle: "Optionally upload previous reports, prescriptions, or medical records.",
  documentsUpload: "Upload Document",
  documentsDone: "Done — Proceed to Verification",
  documentsProcessing: "Processing...",

  // Inactivity banner
  inactivityWarning: "Your session will be cleared in {{seconds}}s due to inactivity.",
  inactivityClear: "Clear Session Now",
  inactivityStay: "I'm still here",

  // Privacy
  privacyClearDevice: "Finish & Clear This Device",

  // Generic
  loading: "Loading...",
  error: "An error occurred. Please try again.",
  tryAgain: "Try again",
  yes: "Yes",
  no: "No",
  cancel: "Cancel",
  save: "Save",
  edit: "Edit",
  submit: "Submit",
  back: "Back",
  next: "Next",
  skip: "Skip",
} as const;

export type StringKey = keyof typeof EN_STRINGS;

// ── Cache helpers ──────────────────────────────────────────────────────────────

const CACHE_PREFIX = "medmap_i18n_";

function cacheKey(lang: LangCode): string {
  return `${CACHE_PREFIX}${lang}`;
}

export function getCachedStrings(lang: LangCode): Record<StringKey, string> | null {
  if (lang === "en") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(lang));
    if (!raw) return null;
    return JSON.parse(raw) as Record<StringKey, string>;
  } catch {
    return null;
  }
}

export function setCachedStrings(lang: LangCode, strings: Record<string, string>): void {
  try {
    sessionStorage.setItem(cacheKey(lang), JSON.stringify(strings));
  } catch {
    // Storage quota exceeded – ignore
  }
}

// ── Interpolation ─────────────────────────────────────────────────────────────

/**
 * Replace `{{key}}` placeholders in a string.
 * e.g. interpolate("Question {{index}} of {{total}}", {index:1, total:10})
 *       → "Question 1 of 10"
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

export function getSupportedLanguages(): { code: LangCode; label: string; nativeName: string }[] {
  return [
    { code: "en", label: "English", nativeName: "English" },
    { code: "hi", label: "Hindi", nativeName: "हिन्दी" },
    { code: "kn", label: "Kannada", nativeName: "ಕನ್ನಡ" },
  ];
}

export const HI_STRINGS: Partial<Record<StringKey, string>> = {
  readAloud: "जोर से पढ़ें",
  stopAudio: "रोकें",
  audioLoading: "ऑडियो लोड हो रहा है...",
  audioPlaying: "चल रहा है... रोकने के लिए टैप करें",
  audioUnavailable: "ऑडियो अभी उपलब्ध नहीं है। कृपया स्क्रीन पर प्रश्न पढ़ें।",
  noVoiceForLang: "ऑडियो अभी उपलब्ध नहीं है। कृपया स्क्रीन पर प्रश्न पढ़ें।",
  micTapToSpeak: "बोलने के लिए टैप करें",
  micRecording: "रिकॉर्डिंग ({{seconds}}s)... रोकने के लिए टैप करें",
  micTranscribing: "ऑडियो ट्रांसक्राइब हो रहा है...",
  micTranscriptionNotice: "AI ट्रांसक्रिप्शन - आगे बढ़ने से पहले कृपया जांचें और सुधारें।",
  micServiceError: "भाषण पहचान सेवा में त्रुटि। कृपया नीचे लिखकर या विकल्प चुनकर उत्तर दें।",
  micNoDevice: "इस डिवाइस पर कोई माइक्रोफ़ोन नहीं मिला। कृपया लिखकर उत्तर दें।",
  micDenied: "माइक्रोफ़ोन की अनुमति अस्वीकृत। आप नीचे लिखकर या विकल्प चुनकर जारी रख सकते हैं।",
  micNoSupport: "इस ब्राउज़र में भाषण पहचान समर्थित नहीं है। कृपया लिखकर उत्तर दें।",
  micNoSpeech: "कोई आवाज़ नहीं मिली। कृपया पुनः प्रयास करें।",
  intakeVoiceMode: "ध्वनि मोड",
  intakeTypeMode: "टाइप मोड",
  intakeNext: "सहेजें और जारी रखें",
  intakeSkip: "यह प्रश्न छोड़ें",
  intakeBack: "← वापस",
};

export const KN_STRINGS: Partial<Record<StringKey, string>> = {
  readAloud: "ಓದಿ ಹೇಳಿ",
  stopAudio: "ನಿಲ್ಲಿಸಿ",
  audioLoading: "ಧ್ವನಿಯನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ...",
  audioPlaying: "ಪ್ಲೇ ಆಗುತ್ತಿದೆ... ನಿಲ್ಲಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ",
  audioUnavailable: "ಧ್ವನಿ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಪರದೆಯ ಮೇಲಿನ ಪ್ರಶ್ನೆಯನ್ನು ಓದಿ.",
  noVoiceForLang: "ಧ್ವನಿ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಪರದೆಯ ಮೇಲಿನ ಪ್ರಶ್ನೆಯನ್ನು ಓದಿ.",
  micTapToSpeak: "ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ",
  micRecording: "ರೆಕಾರ್ಡಿಂಗ್ ({{seconds}}s)... ನಿಲ್ಲಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ",
  micTranscribing: "ಧ್ವನಿಯನ್ನು ಪರಿವರ್ತಿಸಲಾಗುತ್ತಿದೆ...",
  micTranscriptionNotice: "AI ಪ್ರತಿಲೇಖನ - ಮುಂದುವರಿಯುವ ಮೊದಲು ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಸರಿಪಡಿಸಿ.",
  micServiceError: "ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಸೇವೆಯಲ್ಲಿ ದೋಷ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ ಮುಂದುವರಿಯಿರಿ.",
  micNoDevice: "ಈ ಸಾಧನದಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಉತ್ತರವನ್ನು ಟೈಪ್ ಮಾಡಿ.",
  micDenied: "ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ನೀವು ಟೈಪ್ ಮಾಡುವ ಮೂಲಕ ಅಥವಾ ಕೆಳಗಿನ ಆಯ್ಕೆಗಳನ್ನು ಆರಿಸುವ ಮೂಲಕ ಮುಂದುವರಿಯಬಹುದು.",
  micNoSupport: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.",
  micNoSpeech: "ಯಾವುದೇ ಧ್ವನಿ ಪತ್ತೆಯಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.",
  intakeVoiceMode: "ಧ್ವನಿ ಮೋಡ್",
  intakeTypeMode: "ಟೈಪ್ ಮೋಡ್",
  intakeNext: "ಉಳಿಸಿ ಮತ್ತು ಮುಂದುವರಿಯಿರಿ",
  intakeSkip: "ಈ ಪ್ರಶ್ನೆಯನ್ನು ಬಿಟ್ಟುಬಿಡಿ",
  intakeBack: "← ಹಿಂದಕ್ಕೆ",
};

export function t(
  key: StringKey,
  lang: LangCode = "en",
  cachedOverrides?: Record<string, string> | null
): string {
  if (cachedOverrides && cachedOverrides[key]) {
    return cachedOverrides[key];
  }
  if (lang !== "en") {
    const cached = getCachedStrings(lang);
    if (cached && cached[key]) {
      return cached[key];
    }
    if (lang === "kn" && KN_STRINGS[key]) {
      return KN_STRINGS[key]!;
    }
    if (lang === "hi" && HI_STRINGS[key]) {
      return HI_STRINGS[key]!;
    }
  }
  return EN_STRINGS[key] ?? (key as string);
}


