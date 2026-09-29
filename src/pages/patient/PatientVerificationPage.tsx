import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, updateCaseStatus, getCaseDocuments } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import './PatientIntakePage.css';

interface CaseDocument {
  documentId?: string;
  id?: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  size?: number;
  storagePath?: string;
  createdAt?: string;
  uploadedAt?: string;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'Unknown size';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function PatientVerificationPage() {
  const { caseId } = useCase();
  const navigate = useNavigate();

  // Case state
  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Document review state
  const [documents, setDocuments] = useState<CaseDocument[] | null>(null);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  // Inline answer edit state
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState<string>('');
  const [isSavingAnswer, setIsSavingAnswer] = useState<boolean>(false);
  const [saveAnswerError, setSaveAnswerError] = useState<string | null>(null);
  const [editedQuestionKeys, setEditedQuestionKeys] = useState<Record<string, boolean>>({});

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCase(caseId);
      setClinicalCase(data);
    } catch (err: any) {
      setError(err.message || "We couldn't load your case. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  const loadDocuments = useCallback(async () => {
    if (!caseId) return;
    setIsDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const docs = await getCaseDocuments(caseId);
      setDocuments(docs);
    } catch (err: any) {
      setDocumentsError(err.message || 'Failed to load attached documents.');
    } finally {
      setIsDocumentsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) {
      navigate('/patient');
      return;
    }

    const initPage = async () => {
      await loadCase();
      loadDocuments();
    };
    initPage();
  }, [caseId, navigate, loadCase, loadDocuments]);

  // Effect to handle automatic transition to patient_verifying when the page is viewed
  useEffect(() => {
    if (clinicalCase && clinicalCase.status === 'intake' && !isUpdating) {
      const transitionToVerifying = async () => {
        try {
          const updated = await updateCaseStatus(caseId!, 'patient_verifying');
          setClinicalCase(updated);
        } catch (err: any) {
          console.error("Failed to update status to patient_verifying", err);
          setUpdateError(err.message || "Failed to initialize verification. Please refresh the page.");
        }
      };
      transitionToVerifying();
    }
  }, [clinicalCase, caseId, isUpdating]);

  const handleStartEdit = (question: string, currentAnswer: string) => {
    setEditingQuestionKey(question);
    setDraftAnswer(currentAnswer || '');
    setSaveAnswerError(null);
  };

  const handleCancelEdit = () => {
    setEditingQuestionKey(null);
    setDraftAnswer('');
    setSaveAnswerError(null);
  };

  const handleSaveEdit = async (question: string) => {
    if (!caseId || !clinicalCase) return;
    setIsSavingAnswer(true);
    setSaveAnswerError(null);

    const updatedIntakeAnswers = {
      ...(clinicalCase.intakeAnswers || {}),
      [question]: draftAnswer.trim(),
    };

    try {
      const updatedCase = await updateCase(caseId, { intakeAnswers: updatedIntakeAnswers });
      setClinicalCase(updatedCase);
      setEditedQuestionKeys((prev) => ({ ...prev, [question]: true }));
      setEditingQuestionKey(null);
      setDraftAnswer('');
    } catch (err: any) {
      setSaveAnswerError(err.message || 'Failed to save answer. Your draft has been kept so you can try again.');
    } finally {
      setIsSavingAnswer(false);
    }
  };

  const handleConfirm = async () => {
    if (!caseId || !clinicalCase) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const updatedCase = await updateCaseStatus(caseId, 'doctor_review');
      setClinicalCase(updatedCase);
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to update case. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!caseId) return null;

  if (isLoading) {
    return (
      <div className="container">
        <div className="intake-page" style={{ padding: '2rem' }}>
          <LoadingIndicator message="Loading your case for verification..." />
        </div>
      </div>
    );
  }

  if (error || !clinicalCase) {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-error-card" role="alert">
            <h2>Something went wrong</h2>
            <ErrorMessage message={error || 'Case not found.'} />
            <div className="intake-error-actions">
              <Button variant="primary" onClick={loadCase}>
                Try Again
              </Button>
              <Link to="/patient" className="intake-btn intake-btn-skip">
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isConfirmed = clinicalCase.status === 'doctor_review' || clinicalCase.status === 'completed';
  const intakeAnswersMap = clinicalCase.intakeAnswers || {};
  const answerEntries = Object.entries(intakeAnswersMap);

  // Compute counts for summary
  const providedCount = answerEntries.filter(([, ans]) => Boolean(ans && ans.trim().length > 0)).length;
  const skippedCount = answerEntries.filter(([, ans]) => !ans || ans.trim().length === 0).length;
  const editedCount = Object.keys(editedQuestionKeys).length;
  const documentCount = documents ? documents.length : 0;

  return (
    <div className="container">
      <div className="intake-page" style={{ maxWidth: '800px' }}>
        <Link to="/patient" className="intake-back-link">
          ← Back to Home
        </Link>

        <div className="intake-header">
          <h1>Verify Your Information</h1>
          <div className="intake-case-id" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span>Case {clinicalCase.caseId}</span>
            <StatusBadge status={clinicalCase.status} />
          </div>
        </div>

        {/* Case Demographics & Consent Overview */}
        <div style={{ marginBottom: '2rem', padding: '1.25rem', backgroundColor: 'var(--color-bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(15, 23, 42, 0.1)' }}>
          <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Please review the information you provided below. You can correct any response before confirming. This information will be shared with the reviewing physician. This is not an automated diagnosis.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>Patient Identifier</strong>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-navy)' }}>{clinicalCase.patientId}</span>
            </div>
            {clinicalCase.language && (
              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>Preferred Language</strong>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-navy)' }}>{clinicalCase.language}</span>
              </div>
            )}
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>Data Sharing Consent</strong>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: clinicalCase.consentGranted ? 'var(--color-verify)' : 'var(--color-warning)' }}>
                {clinicalCase.consentGranted ? 'Granted' : 'Not Granted'}
              </span>
            </div>
          </div>
        </div>

        {/* Questionnaire Responses Section */}
        <div className="intake-question-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>Your Responses</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {answerEntries.length} question{answerEntries.length === 1 ? '' : 's'} recorded
            </span>
          </div>

          {answerEntries.length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {answerEntries.map(([question, answer], index) => {
                const isEditingThis = editingQuestionKey === question;
                const isProvided = Boolean(answer && answer.trim().length > 0);
                const wasEditedInSession = Boolean(editedQuestionKeys[question]);

                return (
                  <li
                    key={index}
                    style={{
                      marginBottom: '1.5rem',
                      paddingBottom: '1.25rem',
                      borderBottom: index === answerEntries.length - 1 ? 'none' : '1px solid var(--color-border-subtle, rgba(15, 23, 42, 0.1))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-navy)', margin: 0, flex: 1, minWidth: '200px', wordBreak: 'break-word' }}>
                        {question}
                      </h3>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {/* Provided / Skipped Badge */}
                        {isProvided ? (
                          <span className="verification-badge verification-badge-provided">
                            Provided
                          </span>
                        ) : (
                          <span className="verification-badge verification-badge-skipped">
                            Skipped
                          </span>
                        )}

                        {/* Edited Session Badge */}
                        {wasEditedInSession && (
                          <span className="verification-badge verification-badge-edited">
                            Edited
                          </span>
                        )}

                        {/* Edit Button (when not confirmed and not editing this item) */}
                        {!isConfirmed && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(question, answer || '')}
                            disabled={isSavingAnswer || isUpdating}
                            aria-label={`Edit response for "${question}"`}
                            className="verification-edit-btn"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditingThis ? (
                      <div className="verification-edit-box" style={{ marginTop: '0.75rem' }}>
                        <label htmlFor={`edit-input-${index}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-navy)', marginBottom: '0.4rem' }}>
                          Edit your response:
                        </label>
                        <textarea
                          id={`edit-input-${index}`}
                          value={draftAnswer}
                          onChange={(e) => setDraftAnswer(e.target.value)}
                          disabled={isSavingAnswer}
                          rows={3}
                          className="intake-textarea"
                          style={{ marginBottom: '0.75rem', width: '100%', wordBreak: 'break-word' }}
                          placeholder="Type your response here..."
                        />

                        {saveAnswerError && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            <ErrorMessage message={saveAnswerError} onDismiss={() => setSaveAnswerError(null)} />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancelEdit}
                            disabled={isSavingAnswer}
                            style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => handleSaveEdit(question)}
                            isLoading={isSavingAnswer}
                            disabled={isSavingAnswer}
                            style={{ padding: '0.4rem 1.1rem', fontSize: '0.85rem' }}
                          >
                            {isSavingAnswer ? 'Saving...' : 'Save Response'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', wordBreak: 'break-word' }}>
                        {isProvided ? (
                          answer
                        ) : (
                          <em style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>(No answer provided)</em>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No responses recorded.</p>
          )}
        </div>

        {/* Attached Documents Review Section */}
        <div className="intake-question-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>Attached Documents</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {documentCount} document{documentCount === 1 ? '' : 's'}
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Review medical records, reports, or files attached to this case.
          </p>

          {isDocumentsLoading ? (
            <div style={{ padding: '1rem 0' }}>
              <LoadingIndicator message="Loading attached documents..." />
            </div>
          ) : documentsError ? (
            <ErrorMessage
              message={documentsError}
              onRetry={loadDocuments}
            />
          ) : documents && documents.length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {documents.map((doc, idx) => {
                const filename = doc.filename || 'Unnamed document';
                const fileSizeStr = formatFileSize(doc.sizeBytes ?? doc.size);
                const uploadDate = doc.createdAt || doc.uploadedAt;
                const formattedDate = uploadDate ? new Date(uploadDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

                return (
                  <li
                    key={doc.documentId || doc.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      marginBottom: '0.5rem',
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid rgba(15, 23, 42, 0.12)',
                      borderRadius: '8px',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                      <span aria-hidden="true" style={{ fontSize: '1.2rem', color: 'var(--color-accent)', flexShrink: 0 }}>
                        📄
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-navy)', wordBreak: 'break-word' }}>
                          {filename}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {fileSizeStr} {formattedDate ? `• Uploaded ${formattedDate}` : ''}
                        </div>
                      </div>
                    </div>

                    <span className="verification-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--color-verify)', color: 'var(--color-verify)' }}>
                      Attached
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-bg)', borderRadius: '8px', border: '1px solid rgba(15, 23, 42, 0.08)', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              No documents are currently attached to this case.
            </div>
          )}
        </div>

        {/* Factual Summary Bar */}
        <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', backgroundColor: 'var(--color-surface)', border: '2px solid var(--color-navy)', borderRadius: '12px', boxShadow: '3px 3px 0px rgba(15, 23, 42, 0.1)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Verification Review Summary
          </h3>
          <div className="verification-summary-grid">
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-verify)' }}>{providedCount}</span>
              <span className="verification-summary-label">Provided</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-warning)' }}>{skippedCount}</span>
              <span className="verification-summary-label">Skipped</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-accent)' }}>{editedCount}</span>
              <span className="verification-summary-label">Edited in Session</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-navy)' }}>{documentCount}</span>
              <span className="verification-summary-label">Documents</span>
            </div>
          </div>
        </div>

        {/* Update / Confirm Errors */}
        {updateError && (
          <div style={{ marginBottom: '1.5rem' }}>
            <ErrorMessage message={updateError} onDismiss={() => setUpdateError(null)} />
          </div>
        )}

        {/* Final Confirmation Action or Completed Card */}
        {isConfirmed ? (
          <div className="intake-complete-card">
            <div className="intake-complete-icon" aria-hidden="true">✓</div>
            <h2>Information Verified</h2>
            <p>Your responses have been confirmed and sent to the doctor for review.</p>
            <Link to="/doctor/cases" className="intake-btn-complete">
              View Doctor Dashboard (Demo) →
            </Link>
          </div>
        ) : (
          <div className="intake-question-card" style={{ textAlign: 'center', backgroundColor: 'var(--color-surface)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              Ready to Confirm?
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              By clicking below, you confirm that you have reviewed the intake responses and attached documents above, and that the information accurately represents what you provided.
            </p>

            {editingQuestionKey !== null && (
              <div style={{ marginBottom: '1rem', color: 'var(--color-warning)', fontSize: '0.85rem', fontWeight: 600 }}>
                Please save or cancel your open response edit before confirming.
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isUpdating}
              disabled={isUpdating || isSavingAnswer || editingQuestionKey !== null}
              className="intake-btn intake-btn-continue"
              style={{ width: '100%', padding: '0.85rem 1.5rem', fontSize: '1rem' }}
            >
              {isUpdating ? 'Confirming...' : 'I Confirm This Information is Accurate'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

