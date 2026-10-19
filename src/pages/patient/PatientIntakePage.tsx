import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, getAdaptiveIntakeState, getUnifiedCase } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import './PatientIntakePage.css';

interface IntakeQuestion {
  id: string;
  category: string;
  prompt: string;
  helperText?: string;
  inputType: 'text' | 'textarea';
  options?: string[];
  clarificationOptions?: string[];
  isOptional?: boolean;
}

interface IntakeSessionState {
  state: 'question' | 'clarification' | 'correction' | 'complete' | 'safety_escalation' | 'incomplete';
  currentQuestion?: IntakeQuestion;
  issue?: string;
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

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

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

  // ── Focus input on question change ────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !error && sessionState?.state !== 'complete' && !isReviewing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionState, isLoading, error, isReviewing]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleAnswerSubmit = async (answerValue: string) => {
    if (!sessionState?.currentQuestion || !caseId) return;
    
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
    handleAnswerSubmit(currentAnswer);
  };
  const handleSkip = () => handleAnswerSubmit('');

  const handlePrevious = async () => {
    if (!caseId || !sessionState?.previousQuestionId) return;
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
    handleAnswerSubmit("I'm not sure / Unknown");
  };

  const handleSelectOption = (option: string) => {
    setValidationError(null);
    setCurrentAnswer(option);
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

  const total = sessionState.totalEligibleQuestions || (answeredQuestionIds.length + 1);
  const currentIdx = sessionState.currentQuestionIndex || (answeredQuestionIds.length + 1);
  const progressPercent = clinicalProgress && clinicalProgress.totalRelevantGaps > 0
    ? Math.min(100, Math.max(10, Math.round((clinicalProgress.resolvedGaps / clinicalProgress.totalRelevantGaps) * 100)))
    : Math.min(100, Math.max(10, Math.round((currentIdx / Math.max(total, 1)) * 100)));
  const progressLabel = clinicalProgress
    ? `${clinicalProgress.activeDomain || currentQuestion.category} (Point ${clinicalProgress.resolvedGaps + 1} of ~${clinicalProgress.totalRelevantGaps})`
    : `Question ${currentIdx} of ${total} (${answeredQuestionIds.length} answered)`;

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
          <h1>Medical History</h1>
          <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center"}}>
            Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
          </p>
        </div>

        <div className="intake-progress">
          <div className="intake-progress-header">
            <span className="intake-progress-label">{currentQuestion.category}</span>
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
          {state === 'clarification' && (
            <div className="intake-clarification-banner">
              <span aria-hidden="true">⚠️</span> {issue || 'Could you provide a little more detail for clarity?'}
            </div>
          )}

          {state === 'clarification' && sessionState.originalAnswer && (
            <div className="intake-original-box">
              <div className="intake-original-box-label">Your Previous Response</div>
              <div className="intake-original-box-val">"{sessionState.originalAnswer}"</div>
            </div>
          )}
          
          <h2 className="intake-question-category">{currentQuestion.category}</h2>
          <p className="intake-question-prompt">{currentQuestion.prompt}</p>
          
          {currentQuestion.helperText && (
            <p className="intake-question-helper" id={`helper-${currentQuestion.id}`}>
              {currentQuestion.helperText}
            </p>
          )}

          {/* Quick Option Pills */}
          {currentQuestion.options && currentQuestion.options.length > 0 && (
            <div className="intake-options-group">
              <div className="intake-options-title">Suggested Options</div>
              <div className="intake-pills-container">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`intake-option-pill ${currentAnswer.trim().toLowerCase() === opt.toLowerCase() ? 'intake-option-pill--selected' : ''}`}
                    onClick={() => handleSelectOption(opt)}
                    disabled={isSubmitting}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clarification Specific Option Pills */}
          {state === 'clarification' && currentQuestion.clarificationOptions && currentQuestion.clarificationOptions.length > 0 && (
            <div className="intake-options-group">
              <div className="intake-options-title">Suggested Clarifications</div>
              <div className="intake-pills-container">
                {currentQuestion.clarificationOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`intake-option-pill ${currentAnswer.trim().toLowerCase() === opt.toLowerCase() ? 'intake-option-pill--selected' : ''}`}
                    onClick={() => handleSelectOption(opt)}
                    disabled={isSubmitting}
                  >
                    {opt}
                  </button>
                ))}
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
