import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DoctorCaseStatusBadge } from '../../components/doctor/DoctorCaseStatusBadge';
import { DoctorSectionCard } from '../../components/doctor/DoctorSectionCard';
import { getCase, getCaseDocuments, updateCase } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import '../../components/doctor/doctorDashboard.css';
import '../../components/doctor/doctorDetail.css';

export function DoctorCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseDetail, setCaseDetail] = useState<ClinicalCase | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState({
    diagnosis: '',
    prescription: '',
    investigations: '',
    advice: '',
    followUp: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!caseId) {
      setError('Invalid Case ID');
      setLoading(false);
      return;
    }

    const fetchCase = async () => {
      try {
        const [data, docs] = await Promise.all([
          getCase(caseId),
          getCaseDocuments(caseId).catch(() => []) // Fallback to empty array if docs fail
        ]);
        setCaseDetail(data);
        if (data.clinicalAssessment) {
          setAssessment({
            diagnosis: data.clinicalAssessment.diagnosis || '',
            prescription: data.clinicalAssessment.prescription || '',
            investigations: data.clinicalAssessment.investigations || '',
            advice: data.clinicalAssessment.advice || '',
            followUp: data.clinicalAssessment.followUp || ''
          });
        }
        setDocuments(docs);
      } catch (err: any) {
        if (err.message === 'Unauthorized') {
          navigate('/doctor/login');
          return;
        }
        setError(err.message || 'Case Record Not Found');
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
  }, [caseId, navigate]);

  const handleSaveDraft = async () => {
    if (!caseId) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const updatedCase = await updateCase(caseId, { clinicalAssessment: assessment });
      setCaseDetail(updatedCase);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        navigate('/doctor/login');
        return;
      }
      setActionError(err.message || 'Failed to save draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteCase = async () => {
    if (!caseId) return;
    setIsCompleting(true);
    setActionError(null);
    try {
      const updatedCase = await updateCase(caseId, { status: 'completed', clinicalAssessment: assessment });
      setCaseDetail(updatedCase);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        navigate('/doctor/login');
        return;
      }
      setActionError(err.message || 'Failed to complete case.');
    } finally {
      setIsCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="doctor-detail-container" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="spinner" style={{ borderTopColor: 'var(--color-primary)' }}></span>
        <h3 style={{ marginTop: '1rem', color: 'var(--color-text-secondary)' }}>Loading Case...</h3>
      </div>
    );
  }

  if (error || !caseDetail) {
    return (
      <div className="doctor-detail-container">
        <nav className="detail-top-nav" aria-label="Not Found Navigation">
          <Link to="/doctor/cases" className="btn-back-link">
            ← Back to Cases Dashboard
          </Link>
        </nav>

        {error && error !== 'Case Record Not Found' && (
          <div style={{ padding: '0 2rem' }}>
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="detail-not-found-card" role="region" aria-label="Case Not Found">
          <span className="not-found-icon" aria-hidden="true">🔍</span>
          <h1 className="not-found-title">Case Record Not Found</h1>
          <p className="not-found-desc">{error || 'The requested case could not be loaded or does not exist.'}</p>
          <Link to="/doctor/cases" className="btn-open-case">
            ← Return to Cases Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const renderVerificationBadge = (status: string) => {
    switch (status) {
      case 'patient_verifying':
        return (
          <span className="verification-badge pending" title="Patient verification is pending">
            ⏳ Verification Pending
          </span>
        );
      case 'doctor_review':
      case 'completed':
        return (
          <span className="verification-badge verified" title="Patient confirmed compiled clinical brief">
            ✓ Patient Verified
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="doctor-detail-container">
      {/* Top Navigation Bar */}
      <nav className="detail-top-nav" aria-label="Case Breadcrumbs">
        <div className="detail-nav-left">
          <Link to="/doctor/cases" className="btn-back-link">
            ← Back to Cases List
          </Link>
          <span className="detail-case-badge">{caseDetail.caseId}</span>
        </div>
      </nav>

      {/* Case Overview & Demographics Header */}
      <header className="detail-case-header">
        <div className="detail-header-top">
          <div className="detail-patient-title-group">
            <h1 className="detail-patient-name">Patient {caseDetail.patientId}</h1>
            <span className="detail-patient-sub">
              Patient Identifier: <strong>{caseDetail.patientId}</strong>
            </span>
          </div>

          <div className="detail-badges-group">
            <DoctorCaseStatusBadge status={caseDetail.status} />
            {renderVerificationBadge(caseDetail.status)}
          </div>
        </div>

        {/* Demographics Grid */}
        <div className="detail-demographics-grid">
          {caseDetail.language && (
            <div className="demo-item">
              <span className="demo-item-label">Language</span>
              <span className="demo-item-val">{caseDetail.language}</span>
            </div>
          )}
          <div className="demo-item">
            <span className="demo-item-label">Consent Granted</span>
            <span className="demo-item-val">{caseDetail.consentGranted ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="detail-main-layout">
        {/* Left Column: Structured Clinical Content */}
        <div className="detail-content-column">
          {caseDetail.intakeAnswers && Object.keys(caseDetail.intakeAnswers).length > 0 ? (
            <DoctorSectionCard title="Patient Intake Responses" tag="Self-Reported">
              <div className="history-subsection">
                {Object.entries(caseDetail.intakeAnswers).map(([question, answer], i) => (
                  <div key={i} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <h3 className="history-subheading" style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>{question}</h3>
                    <p className="clinical-list-item" style={{ margin: 0 }}>{answer}</p>
                  </div>
                ))}
              </div>
            </DoctorSectionCard>
          ) : (
            <div className="doctor-empty-state" style={{ marginTop: 0 }}>
              <span className="empty-icon">📝</span>
              <h3 className="empty-title">No Intake Responses</h3>
              <p className="empty-desc">The patient has not completed the intake questionnaire.</p>
            </div>
          )}

          {/* AI Case Summary */}
          <div style={{ marginTop: '2rem' }}>
            <DoctorSectionCard title="AI Case Summary" tag="AI Assisted">
              {caseDetail.aiSummary ? (
                <div className="history-subsection">
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(23, 92, 222, 0.05)', borderRadius: '8px', border: '1px solid rgba(23, 92, 222, 0.2)' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-navy)', fontStyle: 'italic' }}>
                      ⚠️ <strong>Safety Note:</strong> This summary was generated by AI from patient-provided information. It is not a diagnosis or treatment recommendation.
                    </p>
                  </div>

                  {[
                    { key: 'chiefComplaint', label: 'Chief Complaint' },
                    { key: 'historyOfPresentIllness', label: 'History of Present Illness' },
                    { key: 'pastMedicalHistory', label: 'Past Medical History' }
                  ].map(({ key, label }) => {
                    const value = caseDetail.aiSummary![key as keyof typeof caseDetail.aiSummary];
                    if (!value) return null;
                    return (
                      <div key={key} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <h3 className="history-subheading" style={{ color: 'var(--color-navy)', marginBottom: '0.5rem', fontWeight: 600 }}>
                          {label}
                        </h3>
                        <p className="clinical-list-item" style={{ margin: 0 }}>{value}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="doctor-empty-state" style={{ margin: '1rem 0' }}>
                  <span className="empty-icon">🤖</span>
                  <h3 className="empty-title">AI summary not available yet.</h3>
                </div>
              )}
            </DoctorSectionCard>
          </div>

          {/* Clinical Assessment Form */}
          <div style={{ marginTop: '2rem' }}>
            <DoctorSectionCard title="Clinical Assessment" tag="Physician Only">
              <div className="history-subsection">
                {['diagnosis', 'prescription', 'investigations', 'advice', 'followUp'].map((field) => (
                  <div key={field} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                      {field.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <textarea
                      value={assessment[field as keyof typeof assessment]}
                      onChange={(e) => setAssessment(prev => ({ ...prev, [field]: e.target.value }))}
                      disabled={caseDetail.status === 'completed' || isCompleting || isSaving}
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border-subtle)',
                        fontFamily: 'inherit',
                        resize: 'vertical'
                      }}
                      placeholder={`Enter ${field}...`}
                    />
                  </div>
                ))}
              </div>
            </DoctorSectionCard>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <DoctorSectionCard title="Uploaded Documents" tag={`${documents.length} Files`}>
              {documents.length > 0 ? (
                <div className="history-subsection">
                  {documents.map((doc, i) => (
                    <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: i < documents.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>📄</span>
                        <h3 className="history-subheading" style={{ margin: 0, fontWeight: 600 }}>{doc.filename}</h3>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginLeft: '1.7rem' }}>
                        <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span> •
                        <span style={{ marginLeft: '0.5rem' }}>{doc.mimeType}</span> •
                        <span style={{ marginLeft: '0.5rem' }}>Uploaded: {new Date(doc.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="doctor-empty-state" style={{ margin: '1rem 0' }}>
                  <span className="empty-icon">📂</span>
                  <h3 className="empty-title">No Documents Uploaded</h3>
                  <p className="empty-desc">The patient has not provided any supporting medical files.</p>
                </div>
              )}
            </DoctorSectionCard>
          </div>
        </div>

        {/* Right Column: Physician Review Panel & Sidebar Summary */}
        <aside className="detail-sidebar-column" aria-label="Physician Actions and Metadata">
          {actionError && (
            <div style={{ marginBottom: '1.5rem' }}>
              <ErrorMessage message={actionError} onDismiss={() => setActionError(null)} />
            </div>
          )}

          {caseDetail.status === 'doctor_review' && (
            <div className="clinical-section-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-hand)', fontSize: '1.25rem', margin: '0 0 0.75rem' }}>
                Actions
              </h3>
              <Button
                variant="outline"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                onClick={handleSaveDraft}
                isLoading={isSaving}
                disabled={isSaving || isCompleting}
              >
                {isSaving ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button
                variant="primary"
                style={{ width: '100%', backgroundColor: 'var(--color-verify)', borderColor: 'var(--color-verify)' }}
                onClick={handleCompleteCase}
                isLoading={isCompleting}
                disabled={isSaving || isCompleting}
              >
                {isCompleting ? 'Completing...' : '✓ Mark as Completed'}
              </Button>
            </div>
          )}

          {/* Case Metadata Panel */}
          <div className="clinical-section-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-hand)', fontSize: '1.25rem', margin: '0 0 0.75rem' }}>
              Case Metadata
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Case ID:</strong> {caseDetail.caseId}
              </div>
              <div>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Patient ID:</strong> {caseDetail.patientId}
              </div>
              <div>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Created:</strong>{' '}
                {new Date(caseDetail.createdAt).toLocaleString()}
              </div>
              <div>
                <strong style={{ color: 'var(--color-text-secondary)' }}>Last Updated:</strong>{' '}
                {new Date(caseDetail.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
