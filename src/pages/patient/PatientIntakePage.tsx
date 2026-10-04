import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, getAdaptiveIntakeState } from '../../utils/api';
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
}

interface IntakeSessionState {
  state: 'question' | 'clarification' | 'complete';
  currentQuestion?: IntakeQuestion;
  issue?: string;
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  irrelevantQuestionIds: string[];
  malformedAnswerQuestionIds: string[];
}

export function PatientIntakePage() {
  const { caseId } = useCase();
  const navigate = useNavigate();

  // ── Case loading state ────────────────────────────────────────────────
  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Adaptive Intake state ──────────────────────────────────────────────
  const [sessionState, setSessionState] = useState<IntakeSessionState | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // ── Load case on mount ────────────────────────────────────────────────
  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCase(caseId);
      setClinicalCase(data);
      const loadedAnswers = data.intakeAnswers || {};
      setAnswers(loadedAnswers);
      
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
    } catch {
      setError("We couldn't load your case. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  const refreshAdaptiveState = async (currentAnswers: Record<string, any>, mode?: string, questionId?: string) => {
    try {
      const state = await getAdaptiveIntakeState(caseId!, mode, questionId);
      setSessionState(state);
      
      if (state.state === 'complete' && !mode) {
        setIsReviewing(true);
      } else {
        setIsReviewing(false);
      }

      const rawAns = currentAnswers[state.currentQuestion.id];
      if (rawAns !== undefined) {
        setCurrentAnswer(typeof rawAns === 'string' ? rawAns : rawAns.value || '');
      } else {
        setCurrentAnswer('');
      }
    } catch (err) {
      setError('Failed to load next question. Please try again.');
    }
  };

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
      await updateCase(caseId, { intakeAnswers: newAnswers });
      setAnswers(newAnswers);
      await refreshAdaptiveState(newAnswers);
    } catch (err) {
      setError('Failed to save your answers. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => handleAnswerSubmit(currentAnswer);
  const handleSkip = () => handleAnswerSubmit('');

  const handleEdit = async (questionId: string) => {
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await refreshAdaptiveState(answers, 'correction', questionId);
    } catch (err) {
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
    } catch (err) {
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

  if (isReviewing || sessionState.state === 'complete') {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>Review Your Medical History</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
          </div>

          <div className="intake-review-card">
            <p className="intake-review-intro">
              Please review the information you have provided. If everything is correct, you can proceed.
            </p>
            
            <div className="intake-review-list">
              {Object.entries(answers).map(([qId, ans]) => (
                <div key={qId} className="intake-review-item">
                  <div className="intake-review-item-content">
                    <strong>{qId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                    <p>{(typeof ans === 'string' ? ans : ans?.value) || <em style={{opacity: 0.6}}>Skipped</em>}</p>
                  </div>
                  <Button variant="outline" onClick={() => handleEdit(qId)} className="intake-btn-edit">Edit</Button>
                </div>
              ))}
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

  const { currentQuestion, state, issue, answeredQuestionIds } = sessionState;
  if (!currentQuestion) return null;

  const progressLabel = `${answeredQuestionIds.length} questions answered`;

  return (
    <div className="container">
      <div className="intake-page">
        <Link to="/" className="intake-back-link">← Back to Home</Link>
        <div className="intake-header">
          <h1>Medical History</h1>
          <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
        </div>

        <div className="intake-progress">
          <div className="intake-progress-header">
            <span className="intake-progress-label">{currentQuestion.category}</span>
            <span className="intake-progress-count">{progressLabel}</span>
          </div>
        </div>

        <div className={`intake-question-card ${state === 'clarification' ? 'intake-clarification-card' : ''}`} key={currentQuestion.id}>
          {state === 'clarification' && (
            <div className="intake-clarification-banner">
              <span aria-hidden="true">⚠️</span> {issue}
            </div>
          )}
          
          <h2 className="intake-question-category">{currentQuestion.category}</h2>
          <p className="intake-question-prompt">{currentQuestion.prompt}</p>
          
          {currentQuestion.helperText && (
            <p className="intake-question-helper" id={`helper-${currentQuestion.id}`}>
              {currentQuestion.helperText}
            </p>
          )}

          {currentQuestion.inputType === 'textarea' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              id={`intake-${currentQuestion.id}`}
              className="intake-textarea"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.prompt}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              id={`intake-${currentQuestion.id}`}
              className="intake-input"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.prompt}
            />
          )}

          <div className="intake-actions">
            <Button variant="outline" onClick={handleSkip} className="intake-btn intake-btn-skip">Skip this question</Button>
            <Button variant="primary" onClick={handleContinue} disabled={currentAnswer.trim().length === 0} id="intake-btn-continue" className="intake-btn intake-btn-continue">
              {state === 'clarification' ? 'Save Clarification →' : 'Continue →'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
