import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, updateCaseStatus, getCaseDocuments, getDocumentFileUrl, logout } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { InactivityCountdownBanner } from '../../components/patient/InactivityCountdownBanner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import { useT } from '../../i18n/useT';
import { formatDate } from '../../utils/language';
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
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function PatientVerificationPage() {
  const { caseId, setCaseId } = useCase();
  const navigate = useNavigate();

  // Case state
  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const { t } = useT(clinicalCase?.language);
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
      setError(err.message || t('verificationLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [caseId, t]);

  const loadDocuments = useCallback(async () => {
    if (!caseId) return;
    setIsDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const docs = await getCaseDocuments(caseId);
      setDocuments(docs);
    } catch (err: any) {
      setDocumentsError(err.message || t('verificationDocsLoadError'));
    } finally {
      setIsDocumentsLoading(false);
    }
  }, [caseId, t]);

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
          setUpdateError(err.message || t('verificationInitError'));
        }
      };
      transitionToVerifying();
    }
  }, [clinicalCase, caseId, isUpdating, t]);

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
      setSaveAnswerError(err.message || t('verificationSaveAnswerError'));
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
      setUpdateError(err.message || t('verificationSubmitError'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFinishAndClear = async () => {
    await logout();
    setCaseId(null);
    navigate('/');
  };

  if (!caseId) return null;

  if (isLoading) {
    return (
      <div className="container">
        <div className="intake-page" style={{ padding: '2rem' }}>
          <LoadingIndicator message={t('loading')} />
        </div>
      </div>
    );
  }

  if (error || !clinicalCase) {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-error-card" role="alert">
            <h2>{t('error')}</h2>
            <ErrorMessage message={error || t('errorCaseNotFound')} />
            <div className="intake-error-actions">
              <Button variant="primary" onClick={loadCase}>
                {t('tryAgain')}
              </Button>
              <Link to="/patient" className="intake-btn intake-btn-skip">
                {t('back')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isConfirmed = clinicalCase.status === 'doctor_review' || clinicalCase.status === 'completed';
  const intakeAnswersMap = clinicalCase.intakeAnswers || {};
  const structuredMap: Record<string, any> = clinicalCase.derivedClinicalData?.structuredIntake || {};

  const safeExtract = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val.original || val.originalValue || val.value || '';
    return String(val);
  };

  // Separate active answers from answers that were invalidated by branch changes
  const activeEntries = Object.entries(intakeAnswersMap).filter(([k]) => {
    if (structuredMap[k] && structuredMap[k].active === false) return false;
    return true;
  });

  const inactiveEntries = Object.entries(intakeAnswersMap).filter(([k]) => {
    return structuredMap[k] && structuredMap[k].active === false;
  });

  // Compute counts for summary
  const providedCount = activeEntries.filter(([, ans]) => Boolean(safeExtract(ans).trim().length > 0)).length;
  const skippedCount = activeEntries.filter(([, ans]) => safeExtract(ans).trim().length === 0).length;
  const editedCount = Object.keys(editedQuestionKeys).length;
  const documentCount = documents ? documents.length : 0;

  return (
    <div className="container">
      <div className="intake-page" style={{ maxWidth: '800px' }}>
        <Link to="/patient" className="intake-back-link">
          {t('intakeBack')}
        </Link>

        <div className="intake-header">
          <h1>{t('verificationHeading')}</h1>
          <div className="intake-case-id" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span>{t('verificationCaseLabel', { id: clinicalCase.caseId })}</span>
            <StatusBadge status={clinicalCase.status} />
          </div>
        </div>

        {/* Case Demographics & Consent Overview */}
        <div style={{ marginBottom: '2rem', padding: '1.25rem', backgroundColor: 'var(--color-bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(15, 23, 42, 0.1)' }}>
          <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
            {t('verificationSubtitle')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>{t('verificationPatientIdentifier')}</strong>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-navy)' }}>{clinicalCase.patientId}</span>
            </div>
            {clinicalCase.language && (
              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>{t('languageLabel')}</strong>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-navy)' }}>{clinicalCase.language}</span>
              </div>
            )}
            <div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'block' }}>{t('verificationDataConsent')}</strong>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: clinicalCase.consentGranted ? 'var(--color-verify)' : 'var(--color-warning)' }}>
                {clinicalCase.consentGranted ? t('verificationConsentGranted') : t('verificationConsentNotGranted')}
              </span>
            </div>
          </div>
        </div>

        {/* AI Assists Notice */}
        <div style={{
          padding: '0.85rem 1.15rem',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>🛡️</span>
          <span style={{ fontSize: '0.88rem', color: '#166534', lineHeight: 1.4 }}>
            {t('aiNotice')}
          </span>
        </div>

        {/* Questionnaire Responses Section */}
        <div className="intake-question-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>{t('verificationAnswersSection')}</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {t('verificationActiveQuestions', { count: activeEntries.length })}
            </span>
          </div>

          {activeEntries.length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {activeEntries.map(([question, answer], index) => {
                const answerText = safeExtract(answer);
                const isEditingThis = editingQuestionKey === question;
                const isProvided = Boolean(answerText.trim().length > 0);
                const wasEditedInSession = Boolean(editedQuestionKeys[question]);
                const meta = structuredMap[question] || {};
                const isUncertain = meta.isUncertain || answerText.toLowerCase().includes('not sure') || answerText.toLowerCase().includes('unknown');
                const isClarified = meta.isClarified;
                const isCorrected = meta.isCorrected || wasEditedInSession;

                return (
                  <li
                    key={index}
                    style={{
                      marginBottom: '1.5rem',
                      paddingBottom: '1.25rem',
                      borderBottom: index === activeEntries.length - 1 ? 'none' : '1px solid var(--color-border-subtle, rgba(15, 23, 42, 0.1))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-navy)', margin: 0, flex: 1, minWidth: '200px', wordBreak: 'break-word' }}>
                        {meta.prompt || question.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h3>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {/* Provided / Skipped Badge */}
                        {isProvided ? (
                          <span className="verification-badge verification-badge-provided">
                            {t('intakeBadgeProvided')}
                          </span>
                        ) : (
                          <span className="verification-badge verification-badge-skipped">
                            {t('intakeBadgeSkipped')}
                          </span>
                        )}

                        {/* Clarified Badge */}
                        {isClarified && (
                          <span className="verification-badge verification-badge-clarified">
                            {t('intakeBadgeClarified')}
                          </span>
                        )}

                        {/* Corrected Badge */}
                        {isCorrected && (
                          <span className="verification-badge verification-badge-edited">
                            {t('intakeBadgeCorrected')}
                          </span>
                        )}

                        {/* Uncertain Badge */}
                        {isUncertain && (
                          <span className="verification-badge verification-badge-uncertain">
                            {t('intakeBadgeUncertain')}
                          </span>
                        )}

                        {/* Edit Button (when not confirmed and not editing this item) */}
                        {!isConfirmed && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(question, answerText)}
                            disabled={isSavingAnswer || isUpdating}
                            aria-label={t('edit')}
                            className="verification-edit-btn"
                          >
                            {t('verificationEdit')}
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditingThis ? (
                      <div className="verification-edit-box" style={{ marginTop: '0.75rem' }}>
                        <label htmlFor={`edit-input-${index}`} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-navy)', marginBottom: '0.4rem' }}>
                          {t('verificationEditResponseLabel')}
                        </label>
                        <textarea
                          id={`edit-input-${index}`}
                          value={draftAnswer}
                          onChange={(e) => setDraftAnswer(e.target.value)}
                          disabled={isSavingAnswer}
                          rows={3}
                          className="intake-textarea"
                          style={{ marginBottom: '0.75rem', width: '100%', wordBreak: 'break-word' }}
                          placeholder={t('intakePlaceholder')}
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
                            {t('verificationCancel')}
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => handleSaveEdit(question)}
                            isLoading={isSavingAnswer}
                            disabled={isSavingAnswer}
                            style={{ padding: '0.4rem 1.1rem', fontSize: '0.85rem' }}
                          >
                            {isSavingAnswer ? t('intakeSaving') : t('verificationSave')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', wordBreak: 'break-word' }}>
                        {isProvided ? (
                          answerText
                        ) : (
                          <em style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>{t('verificationNoAnswerProvided')}</em>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>{t('verificationNoAnswers')}</p>
          )}

          {/* Inactive audit trail note if branch conditions changed */}
          {inactiveEntries.length > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(15, 23, 42, 0.04)', borderRadius: '8px', border: '1px dashed rgba(15, 23, 42, 0.15)' }}>
              <strong style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('verificationAuditTrailTitle')}
              </strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {t('verificationAuditTrailNotice', { questions: inactiveEntries.map(([k]) => k.replace(/_/g, ' ')).join(', ') })}
              </p>
            </div>
          )}
        </div>

        {/* Attached Documents Review Section */}
        <div className="intake-question-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>{t('verificationDocumentsSection')}</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {documentCount} {t('verificationDocumentsLabel')}
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            {t('verificationReviewRecords')}
          </p>

          {isDocumentsLoading ? (
            <div style={{ padding: '1rem 0' }}>
              <LoadingIndicator message={t('loading')} />
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
                const formattedDate = uploadDate ? formatDate(uploadDate, clinicalCase.language) : null;

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
                          {fileSizeStr} {formattedDate && <>• {t('verificationUploadedDate', { date: formattedDate })}</>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <a
                        href={getDocumentFileUrl(clinicalCase.caseId, doc.id || doc.documentId || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.2rem 0.6rem',
                          border: '1px solid var(--color-primary)',
                          borderRadius: '4px',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {t('verificationOpenFile')}
                      </a>
                      <span className="verification-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--color-verify)', color: 'var(--color-verify)' }}>
                        {t('verificationAttachedBadge')}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-bg)', borderRadius: '8px', border: '1px solid rgba(15, 23, 42, 0.08)', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              {t('verificationNoDocuments')}
            </div>
          )}
        </div>

        {/* Factual Summary Bar */}
        <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', backgroundColor: 'var(--color-surface)', border: '2px solid var(--color-navy)', borderRadius: '12px', boxShadow: '3px 3px 0px rgba(15, 23, 42, 0.1)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('verificationSummaryTitle')}
          </h3>
          <div className="verification-summary-grid">
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-verify)' }}>{providedCount}</span>
              <span className="verification-summary-label">{t('intakeBadgeProvided')}</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-warning)' }}>{skippedCount}</span>
              <span className="verification-summary-label">{t('intakeBadgeSkipped')}</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-accent)' }}>{editedCount}</span>
              <span className="verification-summary-label">{t('verificationEditedInSession')}</span>
            </div>
            <div className="verification-summary-item">
              <span className="verification-summary-num" style={{ color: 'var(--color-navy)' }}>{documentCount}</span>
              <span className="verification-summary-label">{t('verificationDocumentsLabel')}</span>
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
            <h2>{t('verificationConfirmedTitle')}</h2>
            <p>{t('verificationConfirmedBody')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem', width: '100%', maxWidth: '360px', margin: '1.25rem auto 0' }}>
              <Button
                variant="primary"
                onClick={handleFinishAndClear}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  fontSize: '0.95rem',
                  backgroundColor: '#0f172a',
                  borderColor: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontWeight: 600,
                }}
              >
                🛡️ {t('privacyClearDevice')}
              </Button>
              <Link to="/doctor/cases" className="intake-btn-complete" style={{ padding: '0.65rem', fontSize: '0.88rem' }}>
                {t('verificationViewDoctorDemo')}
              </Link>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.75rem', display: 'block' }}>
              {t('verificationClearNotice')}
            </span>
          </div>
        ) : (
          <div className="intake-question-card" style={{ textAlign: 'center', backgroundColor: 'var(--color-surface)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              {t('verificationReadyToConfirm')}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              {t('verificationConfirmDisclaimer')}
            </p>

            {editingQuestionKey !== null && (
              <div style={{ marginBottom: '1rem', color: 'var(--color-warning)', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('verificationOpenEditWarning')}
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
              {isUpdating ? t('verificationSubmitting') : t('verificationConfirmButton')}
            </Button>
          </div>
        )}
      </div>

      {/* Auto-clear inactivity countdown timer */}
      <InactivityCountdownBanner onClearDevice={handleFinishAndClear} lang={clinicalCase.language} />
    </div>
  );
}
