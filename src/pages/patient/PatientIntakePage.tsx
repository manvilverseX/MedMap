import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, getAdaptiveIntakeState, getUnifiedCase } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import { useT } from '../../i18n/useT';
import './PatientIntakePage.css';

interface IntakeQuestion {
  id: string;
  category: string;
  categoryLocalized?: string;
  prompt: string;
  promptLocalized?: string;
  helperText?: string;
  helperTextLocalized?: string;
  inputType: 'text' | 'textarea';
  options?: string[];
  optionsLocalized?: string[];
  clarificationOptions?: string[];
  clarificationOptionsLocalized?: string[];
  isOptional?: boolean;
}

interface IntakeSessionState {
  state: 'question' | 'clarification' | 'correction' | 'complete' | 'safety_escalation' | 'incomplete';
  currentQuestion?: IntakeQuestion;
  issue?: string;
  issueLocalized?: string | null;
  previousQuestionId?: string | null;
  originalAnswer?: string | null;
  clarificationAttempts?: number;
  totalEligibleQuestions?: number;
  currentQuestionIndex?: number;
  allowUncertainty?: boolean;
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  irrelevantQuestionIds: string[];
  malformedAnswerQuestionIds: string[];
  translated?: boolean;
  translationLang?: string;
  translationFallbackNotice?: string | null;
  aiTranslationTag?: string | null;
  safetyEscalation?: {
    triggered: boolean;
    severity: 'emergency' | 'urgent';
    headline: string;
    reason: string;
    guidance: string;
    redFlagsDetected: string[];
    suggestedAction: string;
  };
  clinicalProgress?: {
    stage: string;
    activeDomain: string;
    exploredDomains: string[];
    totalRelevantGaps: number;
    resolvedGaps: number;
  };
}

export function PatientIntakePage() {
  const { caseId } = useCase();
  const navigate = useNavigate();

  // ── Case loading state ────────────────────────────────────────────────
  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const [unifiedCase, setUnifiedCase] = useState<any>(null);
  const [showLongitudinalPrompt, setShowLongitudinalPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Adaptive Intake state ──────────────────────────────────────────────
  const [sessionState, setSessionState] = useState<IntakeSessionState | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Voice & Audio state (Web Speech API) ────────────────────────────────
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [pendingCriticalConfirmation, setPendingCriticalConfirmation] = useState<{
    answer: string;
    questionId: string;
    category: string;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // ── i18n & Language state ───────────────────────────────────────────
  const { t } = useT(clinicalCase?.language);

  // Browser speech language mapping (en-IN, hi-IN, kn-IN)
  const speechLang = clinicalCase?.language?.toLowerCase().startsWith('hi')
    ? 'hi-IN'
    : clinicalCase?.language?.toLowerCase().startsWith('kn')
    ? 'kn-IN'
    : 'en-IN';
  const speechLangName = speechLang === 'hi-IN' ? 'Hindi' : speechLang === 'kn-IN' ? 'Kannada' : 'English';

  const [hasVoiceForLang, setHasVoiceForLang] = useState(true);

  // Check if Web Speech voice is available for non-English speechLang
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const checkVoice = () => {
      const targetPrefix = speechLang.slice(0, 2).toLowerCase();
      if (targetPrefix === 'en') {
        setHasVoiceForLang(true);
        return;
      }
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) {
        return;
      }
      const found = voices.some((v) =>
        v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
      );
      setHasVoiceForLang(found);
    };

    checkVoice();
    window.speechSynthesis.onvoiceschanged = checkVoice;
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [speechLang]);

  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const hasSpeechRecognition = !!SpeechRecognitionAPI;
  const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speakQuestion = useCallback((customText?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    stopSpeaking();
    const promptText = sessionState?.currentQuestion?.promptLocalized || sessionState?.currentQuestion?.prompt || '';
    const helperText = sessionState?.currentQuestion?.helperTextLocalized || sessionState?.currentQuestion?.helperText || '';
    const text = customText || (promptText ? `${promptText}. ${helperText}` : '');
    if (!text) return;
    if (!hasVoiceForLang) return; // Never speak English when patient's language voice is missing!
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLang;
      const voices = window.speechSynthesis.getVoices();
      const targetPrefix = speechLang.slice(0, 2).toLowerCase();
      const matchingVoice = voices.find((v) =>
        v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }, [sessionState?.currentQuestion, speechLang, stopSpeaking, hasVoiceForLang]);

  const startListening = () => {
    if (!SpeechRecognitionAPI) {
      setSpeechError('Speech recognition is not supported in this browser. Please use touch/typing.');
      return;
    }
    setSpeechError(null);
    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const recognized = (final || interim).trim();
        if (recognized) {
          setSpeechTranscript(recognized);
          setCurrentAnswer(recognized);
          setValidationError(null);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError('Microphone permission denied. You can continue by typing or choosing options below.');
        } else if (event.error === 'no-speech') {
          setSpeechError('No speech was detected. Please tap the mic and try speaking again.');
        } else {
          setSpeechError(`Speech recognition notice (${event.error}). Please use touch or typing.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('Unable to start microphone. Please check your browser audio settings.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
    }
  };

  const isCriticalQuestion = (questionId?: string) => {
    if (!questionId) return false;
    const q = questionId.toLowerCase();
    return q.includes('allerg') || q.includes('medicat') || q.includes('medicine');
  };

  /**
   * Returns true when a freetext answer consists entirely of non-alphanumeric
   * characters (e.g. ".", "...", "!?!") and is therefore meaningless.
   * Mirrors the server-side check in validate_clinical_answer.
   * Only applied to text / textarea inputs; option-pill selections are always valid.
   */
  const isMeaninglessTextAnswer = (value: string): boolean => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return false; // empty is handled by the existing disabled check
    return !/[a-zA-Z0-9]/.test(trimmed);
  };

  const refreshAdaptiveState = useCallback(async (currentAnswers: Record<string, any>, mode?: string, questionId?: string) => {
    try {
      const state = await getAdaptiveIntakeState(caseId!, mode, questionId);
      setSessionState(state);
      
      if (state.state === 'complete' && !mode) {
        setIsReviewing(true);
      } else {
        setIsReviewing(false);
      }

      if (state.currentQuestion) {
        const rawAns = currentAnswers[state.currentQuestion.id];
        if (rawAns !== undefined) {
          setCurrentAnswer(typeof rawAns === 'string' ? rawAns : rawAns.value || '');
        } else {
          setCurrentAnswer('');
        }
      } else {
        setCurrentAnswer('');
      }
    } catch {
      setError('Failed to load next question. Please try again.');
    }
  }, [caseId]);

  // ── Load case on mount ────────────────────────────────────────────────
  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [data, unified] = await Promise.all([
        getCase(caseId),
        getUnifiedCase(caseId).catch(() => null)
      ]);
      setClinicalCase(data);
      setUnifiedCase(unified);
      
      const loadedAnswers = data.intakeAnswers || {};
      setAnswers(loadedAnswers);
      
      // If patient is returning and hasn't answered anything yet, show the longitudinal prompt
      if (unified && unified.previousVerified && Object.keys(loadedAnswers).length === 0 && data.status === 'intake') {
        setShowLongitudinalPrompt(true);
      }
      
      if (data.status !== 'intake') {
        setSessionState({
          state: 'complete',
          answeredQuestionIds: Object.keys(loadedAnswers).filter(k => loadedAnswers[k] !== ''),
          skippedQuestionIds: Object.keys(loadedAnswers).filter(k => loadedAnswers[k] === ''),
          irrelevantQuestionIds: [],
          malformedAnswerQuestionIds: []
        });
        setIsReviewing(true);
      } else {
        await refreshAdaptiveState(data.intakeAnswers || {});
      }
    } catch (err: any) {
      setError(err?.message || "We couldn't load your case. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId, refreshAdaptiveState]);

  useEffect(() => {
    if (!caseId) {
      navigate('/patient');
      return;
    }
    loadCase();
  }, [caseId, navigate, loadCase]);

  // ── Stop speaking/listening on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  // ── Auto-read question if voice mode is ON ────────────────────────────
  useEffect(() => {
    if (voiceMode && sessionState?.currentQuestion) {
      speakQuestion();
    }
  }, [sessionState?.currentQuestion?.id, voiceMode, speakQuestion]);

  // ── Focus input on question change ────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !error && sessionState?.state !== 'complete' && !isReviewing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionState, isLoading, error, isReviewing]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleAnswerSubmit = async (answerValue: string) => {
    if (!sessionState?.currentQuestion || !caseId) return;
    
    stopSpeaking();
    stopListening();
    setSpeechTranscript('');
    setPendingCriticalConfirmation(null);

    setIsSubmitting(true);
    setError(null);
    try {
      const newAnswers = { ...answers, [sessionState.currentQuestion.id]: answerValue };
      const updatedCase = await updateCase(caseId, { intakeAnswers: newAnswers });
      const savedAnswers = updatedCase.intakeAnswers || newAnswers;
      setAnswers(savedAnswers);
      await refreshAdaptiveState(savedAnswers);
    } catch (err: any) {
      setError(err?.message || 'Failed to save your answers. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (sessionState?.currentQuestion?.options?.length === 0 || !sessionState?.currentQuestion?.options) {
      // Freetext path — run client-side meaningful-answer check
      if (isMeaninglessTextAnswer(currentAnswer)) {
        setValidationError('Please describe your answer using words or numbers so your care team can understand.');
        return;
      }
    }
    setValidationError(null);

    // Stronger confirmation step for allergies and medicines
    if (sessionState?.currentQuestion && isCriticalQuestion(sessionState.currentQuestion.id)) {
      setPendingCriticalConfirmation({
        answer: currentAnswer,
        questionId: sessionState.currentQuestion.id,
        category: sessionState.currentQuestion.category,
      });
      return;
    }

    handleAnswerSubmit(currentAnswer);
  };
  const handleSkip = () => {
    setPendingCriticalConfirmation(null);
    handleAnswerSubmit('');
  };

  const handlePrevious = async () => {
    if (!caseId || !sessionState?.previousQuestionId) return;
    stopSpeaking();
    stopListening();
    setSpeechTranscript('');
    setPendingCriticalConfirmation(null);
    setIsSubmitting(true);
    setError(null);
    try {
      await refreshAdaptiveState(answers, 'correction', sessionState.previousQuestionId);
    } catch {
      setError('Failed to navigate to previous question.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUncertain = () => {
    setPendingCriticalConfirmation(null);
    handleAnswerSubmit("I'm not sure / Unknown");
  };

  const handleSelectOption = (option: string) => {
    setValidationError(null);
    setCurrentAnswer(option);

    // Stronger confirmation step for allergies and medicines
    if (sessionState?.currentQuestion && isCriticalQuestion(sessionState.currentQuestion.id)) {
      setPendingCriticalConfirmation({
        answer: option,
        questionId: sessionState.currentQuestion.id,
        category: sessionState.currentQuestion.category,
      });
      return;
    }

    handleAnswerSubmit(option);
  };

  const handleEdit = async (questionId: string) => {
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await refreshAdaptiveState(answers, 'correction', questionId);
    } catch {
      setError('Failed to load question for correction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!caseId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await updateCase(caseId, { status: 'patient_verifying' });
      navigate('/patient/documents');
    } catch {
      setError('Failed to confirm your answers. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      sessionState?.currentQuestion?.inputType === 'text' &&
      currentAnswer.trim().length > 0
    ) {
      e.preventDefault();
      handleContinue();
    }
  };

  if (!caseId) return null;

  if (isLoading || isSubmitting) {
    return (
      <div className="container">
        <div className="intake-page">
          <LoadingIndicator message={isSubmitting ? "Saving your answers…" : "Loading your intake…"} />
        </div>
      </div>
    );
  }

  if (error || !clinicalCase || !sessionState) {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-error-card" role="alert">
            <h2>Something went wrong</h2>
            <ErrorMessage message={error || 'Case not found.'} />
            <div className="intake-error-actions">
              <Button variant="primary" onClick={loadCase}>Try Again</Button>
              <Link to="/" className="intake-btn intake-btn-skip">Back to Home</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showLongitudinalPrompt && unifiedCase?.previousVerified) {
    const prevDate = new Date(unifiedCase.previousVerified.createdAt).toLocaleDateString();
    
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>Welcome Back</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
          </div>
          
          <div className="intake-review-card">
            <div style={{ backgroundColor: 'var(--color-background-alt)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--color-border-subtle)'}}>
              <p style={{ margin: 0, fontWeight: 600 }}>We have your verified medical information from your previous visit on {prevDate}.</p>
            </div>
            
            <h2 className="intake-question-prompt">What has changed since your last visit?</h2>
            <p className="intake-question-helper">Please tell us about any new symptoms, worsened conditions, or changes in your medications. If nothing has changed for a particular issue, you don't need to re-enter it.</p>
            
            <textarea
              className={`intake-textarea${validationError ? ' intake-input--error' : ''}`}
              placeholder="e.g. My fever is gone but I have a new cough. I started taking cough syrup."
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              rows={4}
              style={{ width: '100%', marginTop: '1rem' }}
            />
            {validationError && (
              <p className="intake-validation-error" role="alert" aria-live="polite">
                {validationError}
              </p>
            )}
            
            <div className="intake-actions" style={{marginTop: '2rem'}}>
              {error && <ErrorMessage message={error} />}
              <Button variant="outline" onClick={() => { setShowLongitudinalPrompt(false); setCurrentAnswer(''); setValidationError(null); }} className="intake-btn intake-btn-skip">
                Skip / Start Fresh
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (isMeaninglessTextAnswer(currentAnswer)) {
                    setValidationError('Please describe your answer using words or numbers so your care team can understand.');
                    return;
                  }
                  if (currentAnswer.trim().length > 0) {
                    await handleAnswerSubmit(currentAnswer);
                  }
                  setShowLongitudinalPrompt(false);
                  setCurrentAnswer('');
                  setValidationError(null);
                }}
                className="intake-btn-continue"
                disabled={isSubmitting || currentAnswer.trim().length === 0 || isMeaninglessTextAnswer(currentAnswer)}
              >
                {isSubmitting ? 'Saving...' : 'Save & Continue →'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isReviewing || sessionState.state === 'complete') {
    // Exclude questions that became inactive due to branch changes (e.g. allergy reaction when allergy is No)
    const irrelevantSet = new Set(sessionState.irrelevantQuestionIds || []);
    const relevantEntries = Object.entries(answers).filter(([qId]) => !irrelevantSet.has(qId));

    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>Review Your Medical History</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
          </div>

          <div className="intake-review-card">
            <p className="intake-review-intro">
              Please review the information you have provided below. You can edit any answer or continue to document verification.
            </p>
            
            <div className="intake-review-list">
              {relevantEntries.map(([qId, ans]) => {
                const answerText = typeof ans === 'string' ? ans : (ans?.value || ans?.originalValue || '');
                const isSkipped = !answerText || answerText.trim().length === 0;
                const isUncertain = answerText.toLowerCase().includes('not sure') || answerText.toLowerCase().includes('unknown');

                return (
                  <div key={qId} className="intake-review-item">
                    <div className="intake-review-item-content">
                      <strong>{qId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                      <p>
                        {isSkipped ? (
                          <em style={{opacity: 0.6}}>Skipped</em>
                        ) : (
                          <span>
                            {answerText}
                            {isUncertain && (
                              <span className="verification-badge" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid var(--color-warning)' }}>
                                Uncertain
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => handleEdit(qId)} className="intake-btn-edit">Edit</Button>
                  </div>
                );
              })}
            </div>

            <div className="intake-actions" style={{marginTop: '2rem'}}>
              {error && <ErrorMessage message={error} />}
              <Button
                variant="primary"
                onClick={handleComplete}
                className="intake-btn-complete"
                id="intake-continue-documents"
                disabled={isSubmitting}
                style={{width: '100%', textAlign: 'center', display: 'block'}}
              >
                {isSubmitting ? 'Confirming...' : 'Confirm & Continue to Documents →'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionState.state === 'safety_escalation' && sessionState.safetyEscalation) {
    const escalation = sessionState.safetyEscalation;
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>Urgent Clinical Notice</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center"}}>
              Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
          </div>

          <div className="intake-safety-card" role="alert">
            <div className="intake-safety-header">
              <span className="intake-safety-icon" aria-hidden="true">🚨</span>
              <h2>{escalation.headline || 'Immediate Medical Attention Recommended'}</h2>
            </div>

            <p className="intake-safety-message">{escalation.reason}</p>

            <div className="intake-safety-instructions">
              <strong>Recommended Action</strong>
              <p>{escalation.guidance}</p>
            </div>

            {escalation.redFlagsDetected && escalation.redFlagsDetected.length > 0 && (
              <div className="intake-safety-flags">
                <strong>Symptoms of Clinical Concern:</strong>
                <ul>
                  {escalation.redFlagsDetected.map((flag, idx) => (
                    <li key={idx}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="intake-safety-disclaimer">
              Deterministic clinical safety alert: MedMap pre-consultation intake does not provide emergency treatment or replace an in-person emergency evaluation.
            </p>

            <div className="intake-safety-actions">
              <a href="tel:112" className="intake-btn intake-btn-emergency" id="btn-call-emergency">
                📞 Call Emergency Services (112 / 911)
              </a>
              {sessionState.previousQuestionId && (
                <button
                  type="button"
                  onClick={() => handleEdit(sessionState.previousQuestionId!)}
                  className="intake-btn intake-btn-edit"
                  disabled={isSubmitting}
                >
                  Edit My Last Answer
                </button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsReviewing(true)}
                className="intake-btn intake-btn-skip"
              >
                Review Answers Recorded So Far
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionState.state === 'incomplete') {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>Intake Threshold Reached</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center"}}>
              Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
          </div>

          <div className="intake-question-card" style={{ borderColor: 'var(--color-accent)' }}>
            <h2 className="intake-question-category">Clinical Safeguard Limit</h2>
            <p className="intake-question-prompt">
              We have collected comprehensive background information for your visit.
            </p>
            <p className="intake-question-helper">
              To protect the accuracy of your clinical intake and prevent repetitive questions, online questioning has been paused. All information you have provided has been securely preserved and will be reviewed directly by your doctor during your consultation.
            </p>

            <div className="intake-actions" style={{ marginTop: '2rem' }}>
              <Button
                variant="primary"
                onClick={() => setIsReviewing(true)}
                className="intake-btn-complete"
                style={{ width: '100%', textAlign: 'center' }}
              >
                Proceed to Review & Verify Answers →
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { currentQuestion, state, issue, answeredQuestionIds, previousQuestionId, clinicalProgress } = sessionState;
  if (!currentQuestion) return null;
  const answeredCount = answeredQuestionIds?.length || 0;
  const total = sessionState.totalEligibleQuestions || (answeredCount + 1);
  const currentIdx = sessionState.currentQuestionIndex || (answeredCount + 1);
  const progressPercent = clinicalProgress && clinicalProgress.totalRelevantGaps > 0
    ? Math.min(100, Math.max(10, Math.round((clinicalProgress.resolvedGaps / clinicalProgress.totalRelevantGaps) * 100)))
    : Math.min(100, Math.max(10, Math.round((currentIdx / Math.max(total, 1)) * 100)));
  const progressLabel = clinicalProgress
    ? `${clinicalProgress.activeDomain || currentQuestion.category} (Point ${clinicalProgress.resolvedGaps + 1} of ~${clinicalProgress.totalRelevantGaps})`
    : `Question ${currentIdx} of ${total} (${answeredCount} answered)`;


  return (
    <div className="container">
      <div className="intake-page">
        <div className="intake-nav-controls">
          <Link to="/" className="intake-back-link" style={{ margin: 0 }}>← Back to Home</Link>
          {previousQuestionId && (
            <button
              type="button"
              onClick={handlePrevious}
              className="intake-btn-nav-back"
              disabled={isSubmitting}
              aria-label="Go to previous question"
            >
              ← Previous Question
            </button>
          )}
        </div>

        <div className="intake-header">
          <h1>{t('intakeHeading') || 'Medical History'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", margin: 0}}>
              Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
            <div className="intake-lang-switch">
              <label htmlFor="intake-lang-select" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {t('languageLabel') || 'Language'}:
              </label>
              <select
                id="intake-lang-select"
                value={clinicalCase?.language || 'English'}
                onChange={async (e) => {
                  const newLang = e.target.value;
                  if (clinicalCase && caseId) {
                    setClinicalCase({ ...clinicalCase, language: newLang });
                    await updateCase(caseId, { language: newLang });
                    await refreshAdaptiveState(answers);
                  }
                }}
                className="intake-lang-select"
              >
                <option value="English">English</option>
                <option value="Hindi">हिंदी (Hindi)</option>
                <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Voice Mode Toggle Bar (Web Speech API) */}
        <div className="intake-voice-bar">
          <div className="intake-voice-toggle-group">
            <div>
              <span className="intake-voice-label">Voice & Audio Mode</span>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Browser-based speech (Web Speech API) &middot; {speechLangName}
              </p>
            </div>
            <button
              type="button"
              className={`intake-voice-toggle-btn ${voiceMode ? 'intake-voice-toggle-btn--active' : ''}`}
              onClick={() => {
                const nextMode = !voiceMode;
                setVoiceMode(nextMode);
                if (!nextMode) stopSpeaking();
              }}
              aria-pressed={voiceMode}
              id="btn-toggle-voice-mode"
            >
              {voiceMode ? '🔊 Voice Mode: ON' : '🔈 Voice Mode: OFF'}
            </button>
          </div>
          {speechError && (
            <div className="intake-speech-fallback-banner" role="alert">
              <span>ℹ️</span> {speechError}
            </div>
          )}
        </div>

        <div className="intake-progress">
          <div className="intake-progress-header">
            <span className="intake-progress-label">{currentQuestion.categoryLocalized || currentQuestion.category}</span>
            <span className="intake-progress-count">{progressLabel}</span>
          </div>
          <div className="intake-progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="intake-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {clinicalProgress && (
            <div className="intake-progress-chips" aria-label="Clinical Domains Explored">
              {clinicalProgress.exploredDomains?.map((domain) => (
                <span key={domain} className="intake-chip intake-chip--done">
                  ✓ {domain}
                </span>
              ))}
              {clinicalProgress.activeDomain && (
                <span className="intake-chip intake-chip--active">
                  ● {clinicalProgress.activeDomain}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={`intake-question-card ${state === 'clarification' ? 'intake-clarification-card' : ''}`} key={currentQuestion.id}>
          {sessionState.translationFallbackNotice && (
            <div className="intake-fallback-notice" role="alert">
              <span>⚠️</span> {sessionState.translationFallbackNotice}
            </div>
          )}

          {state === 'clarification' && (
            <div className="intake-clarification-banner">
              <span aria-hidden="true">⚠️</span> {sessionState.issueLocalized || issue || t('intakeClarificationPrompt') || 'Could you provide a little more detail for clarity?'}
            </div>
          )}

          {state === 'clarification' && sessionState.originalAnswer && (
            <div className="intake-original-box">
              <div className="intake-original-box-label">Your Previous Response</div>
              <div className="intake-original-box-val">"{sessionState.originalAnswer}"</div>
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>
              {currentQuestion.categoryLocalized || currentQuestion.category}
            </h2>
            {sessionState.aiTranslationTag && (
              <span className="intake-ai-tag">
                🤖 {sessionState.aiTranslationTag}
              </span>
            )}
          </div>

          <div className="intake-prompt-row">
            <p className="intake-question-prompt">{currentQuestion.promptLocalized || currentQuestion.prompt}</p>
            {hasSpeechSynthesis && (
              <button
                type="button"
                className={`intake-btn-read-aloud ${isSpeaking ? 'intake-btn-read-aloud--speaking' : ''}`}
                onClick={() => (isSpeaking ? stopSpeaking() : speakQuestion())}
                title={hasVoiceForLang ? "Read question aloud or replay" : t('noVoiceForLang')}
                disabled={!hasVoiceForLang}
                aria-label="Read question aloud"
                id="btn-read-aloud-question"
              >
                {isSpeaking ? '⏹ Stop' : '🔊 Read Aloud'}
              </button>
            )}
          </div>

          {!hasVoiceForLang && (
            <div className="intake-no-voice-notice" role="note">
              ℹ️ {t('noVoiceForLang')}
            </div>
          )}
          
          {(currentQuestion.helperTextLocalized || currentQuestion.helperText) && (
            <p className="intake-question-helper" id={`helper-${currentQuestion.id}`}>
              {currentQuestion.helperTextLocalized || currentQuestion.helperText}
            </p>
          )}

          {/* Quick Option Pills */}
          {currentQuestion.options && currentQuestion.options.length > 0 && (
            <div className="intake-options-group">
              <div className="intake-options-title">Suggested Options</div>
              <div className="intake-pills-container">
                {currentQuestion.options.map((opt: any, idx: number) => {
                  const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || opt.id || String(opt));
                  const rawDisplay = currentQuestion.optionsLocalized?.[idx] || opt;
                  const displayLabel = typeof rawDisplay === 'string' ? rawDisplay : (rawDisplay.label || rawDisplay.value || String(rawDisplay));
                  const isSelected = currentAnswer.trim().toLowerCase() === optValue.toLowerCase();
                  return (
                    <button
                      key={typeof opt === 'string' ? opt : (opt.id || opt.value || idx)}
                      type="button"
                      className={`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`}
                      onClick={() => handleSelectOption(optValue)}
                      disabled={isSubmitting}
                    >
                      {displayLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clarification Specific Option Pills */}
          {state === 'clarification' && currentQuestion.clarificationOptions && currentQuestion.clarificationOptions.length > 0 && (
            <div className="intake-options-group">
              <div className="intake-options-title">Suggested Clarifications</div>
              <div className="intake-pills-container">
                {currentQuestion.clarificationOptions.map((opt: any, idx: number) => {
                  const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || opt.id || String(opt));
                  const rawDisplay = currentQuestion.clarificationOptionsLocalized?.[idx] || opt;
                  const displayLabel = typeof rawDisplay === 'string' ? rawDisplay : (rawDisplay.label || rawDisplay.value || String(rawDisplay));
                  const isSelected = currentAnswer.trim().toLowerCase() === optValue.toLowerCase();
                  return (
                    <button
                      key={typeof opt === 'string' ? opt : (opt.id || opt.value || idx)}
                      type="button"
                      className={`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`}
                      onClick={() => handleSelectOption(optValue)}
                      disabled={isSubmitting}
                    >
                      {displayLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Microphone Voice Input (Web Speech API) */}
          {hasSpeechRecognition ? (
            <div className="intake-mic-container">
              <button
                type="button"
                className={`intake-mic-btn ${isListening ? 'intake-mic-btn--listening' : ''}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isSubmitting}
                aria-label={isListening ? "Stop listening" : "Tap to speak answer"}
                id="btn-mic-input"
              >
                <span aria-hidden="true">{isListening ? '⏹️' : '🎙️'}</span>
                <span>{isListening ? 'Listening... Tap to Stop' : `Tap to Speak (${speechLangName})`}</span>
              </button>
              {isListening && (
                <p className="intake-listening-hint" aria-live="polite">
                  Listening in {speechLangName}... Speak clearly, then review your transcript below.
                </p>
              )}
            </div>
          ) : (
            <p className="intake-speech-unsupported-note">
              🎙️ Speech recognition not supported in this browser. Please use touch or typing below.
            </p>
          )}

          {/* Editable Speech Transcript Banner */}
          {speechTranscript && (
            <div className="intake-transcript-banner" aria-live="polite">
              <div className="intake-transcript-header">
                <span className="intake-transcript-tag">Recognized Voice Answer</span>
                <span className="intake-transcript-hint">Edit in the box below if needed</span>
              </div>
              <div className="intake-transcript-content">"{speechTranscript}"</div>
            </div>
          )}

          {/* Safety Confirmation Step for Allergies & Medications */}
          {pendingCriticalConfirmation && (
            <div className="intake-critical-confirmation-card" role="dialog" aria-modal="true">
              <div className="intake-critical-header">
                <span aria-hidden="true">⚠️</span>
                <h3>Confirm {pendingCriticalConfirmation.category}</h3>
              </div>
              <p className="intake-critical-desc">
                Medicines and allergies are critical to your safety. Please verify what was understood before proceeding:
              </p>
              <div className="intake-critical-value-box">
                <strong>Understood Answer:</strong> "{pendingCriticalConfirmation.answer}"
              </div>
              <div className="intake-critical-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    const ans = pendingCriticalConfirmation.answer;
                    handleAnswerSubmit(ans);
                  }}
                  className="intake-btn-confirm-critical"
                  id="intake-btn-confirm-critical"
                >
                  ✓ Confirm This Is Correct
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingCriticalConfirmation(null);
                    if (inputRef.current) inputRef.current.focus();
                  }}
                  className="intake-btn-edit-critical"
                  id="intake-btn-edit-critical"
                >
                  ✏️ Correct / Edit Answer
                </Button>
              </div>
            </div>
          )}

          {currentQuestion.inputType === 'textarea' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              id={`intake-${currentQuestion.id}`}
              className={`intake-textarea${validationError ? ' intake-input--error' : ''}`}
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.prompt}
              aria-invalid={!!validationError}
              placeholder="Type your response here..."
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              id={`intake-${currentQuestion.id}`}
              className={`intake-input${validationError ? ' intake-input--error' : ''}`}
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.prompt}
              aria-invalid={!!validationError}
              placeholder="Type your response here..."
            />
          )}

          <div className="intake-actions">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="outline"
                onClick={handleSkip}
                className="intake-btn intake-btn-skip"
                disabled={isSubmitting}
              >
                Skip this question
              </Button>
              {sessionState.allowUncertainty !== false && (
                <button
                  type="button"
                  onClick={handleUncertain}
                  className="intake-btn-uncertain"
                  disabled={isSubmitting}
                  title="Indicate uncertainty without penalty"
                >
                  I'm not sure / Unknown
                </button>
              )}
            </div>
            {validationError && (
              <p className="intake-validation-error" role="alert" aria-live="polite">
                {validationError}
              </p>
            )}
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={currentAnswer.trim().length === 0 || isSubmitting || isMeaninglessTextAnswer(currentAnswer)}
              id="intake-btn-continue"
              className="intake-btn intake-btn-continue"
            >
              {state === 'clarification' ? 'Save Clarification →' : 'Continue →'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
