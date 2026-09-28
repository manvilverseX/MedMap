import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCaseStatus } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import './PatientIntakePage.css';

export function PatientVerificationPage() {
  const { caseId } = useCase();
  const navigate = useNavigate();

  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!caseId) {
      navigate('/patient');
      return;
    }
    
    // Load case and automatically transition to patient_verifying if needed
    const initCase = async () => {
      await loadCase();
    };
    initCase();
  }, [caseId, navigate, loadCase]);

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

  return (
    <div className="container">
      <div className="intake-page" style={{ maxWidth: '800px' }}>
        <Link to="/patient" className="intake-back-link">
          ← Back to Home
        </Link>

        <div className="intake-header">
          <h1>Verify Your Information</h1>
          <p className="intake-case-id" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Case {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
          </p>
        </div>

        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: 'var(--color-bg-alt)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ margin: '0 0 0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Please review the information you provided below. This information will be sent to the doctor for review. This is not an automated diagnosis.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <strong>Patient Identifier:</strong> {clinicalCase.patientId}
            </div>
            {clinicalCase.language && (
              <div>
                <strong>Language:</strong> {clinicalCase.language}
              </div>
            )}
            <div>
              <strong>Consent to Share Data:</strong> {clinicalCase.consentGranted ? 'Granted' : 'Not Granted'}
            </div>
          </div>
        </div>

        <div className="intake-question-card" style={{ marginBottom: '2rem' }}>
          <h2 className="intake-question-category">Your Responses</h2>
          {clinicalCase.intakeAnswers && Object.keys(clinicalCase.intakeAnswers).length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {Object.entries(clinicalCase.intakeAnswers).map(([question, answer], index) => (
                <li key={index} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>{question}</h3>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{answer || <em style={{ opacity: 0.6 }}>(Skipped)</em>}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>No responses recorded.</p>
          )}
        </div>

        {updateError && (
          <div style={{ marginBottom: '1rem' }}>
            <ErrorMessage message={updateError} onDismiss={() => setUpdateError(null)} />
          </div>
        )}

        {isConfirmed ? (
          <div className="intake-complete-card">
            <div className="intake-complete-icon" aria-hidden="true">✓</div>
            <h2>Information Verified</h2>
            <p>Your case is now waiting for doctor review.</p>
            <Link to="/doctor/cases" className="intake-btn-complete">
              View Doctor Dashboard (Demo) →
            </Link>
          </div>
        ) : (
          <div className="intake-actions" style={{ marginTop: '2rem' }}>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isUpdating}
              className="intake-btn intake-btn-continue"
              style={{ width: '100%' }}
            >
              {isUpdating ? 'Confirming...' : 'I Confirm This Information is Accurate'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
