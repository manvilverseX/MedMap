import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DoctorCaseStatusBadge } from '../../components/doctor/DoctorCaseStatusBadge';
import { DoctorSectionCard } from '../../components/doctor/DoctorSectionCard';
import { getCase, getCaseDocuments, updateCase, generateAISummary, getClinicalIntelligence, getUnifiedCase, getDocumentFileUrl } from '../../utils/api';
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
  const [clinicalIntelligence, setClinicalIntelligence] = useState<any>(null);
  const [unifiedCase, setUnifiedCase] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
        const [data, docs, ci, unified] = await Promise.all([
          getCase(caseId),
          getCaseDocuments(caseId).catch(() => []), 
          getClinicalIntelligence(caseId).catch(() => null),
          getUnifiedCase(caseId).catch(() => null)
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
        setClinicalIntelligence(ci);
        setUnifiedCase(unified);
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

  const handleGenerateSummary = async () => {
    if (!caseId) return;
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const updatedCase = await generateAISummary(caseId);
      setCaseDetail(updatedCase);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        navigate('/doctor/login');
        return;
      }
      setSummaryError(err.message || 'Failed to generate AI summary.');
    } finally {
      setIsGeneratingSummary(false);
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
              {caseDetail.derivedClinicalData?.patientVerification?.verified && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid var(--color-verify)', borderRadius: '8px' }}>
                  <strong style={{ color: 'var(--color-verify)', display: 'block', fontSize: '0.85rem' }}>
                    ✓ Patient Verification Confirmed
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {caseDetail.derivedClinicalData.patientVerification.statement || 'Patient verified self-reported responses.'}
                    {caseDetail.derivedClinicalData.patientVerification.verifiedAt && ` • ${new Date(caseDetail.derivedClinicalData.patientVerification.verifiedAt).toLocaleString()}`}
                  </span>
                </div>
              )}

              <div className="history-subsection">
                {Object.entries(caseDetail.intakeAnswers)
                  .filter(([question]) => question !== 'ayush' && question !== 'consultation_type' && !question.startsWith('ayush_'))
                  .map(([question, answer], i) => {
                  const structuredInfo = (caseDetail.derivedClinicalData?.structuredIntake || {})[question] || {};
                  const answerText = typeof answer === 'string' ? answer : (answer?.value || answer?.originalValue || '');
                  const isSkipped = !answerText || answerText.trim().length === 0;
                  const isInactive = structuredInfo.active === false;
                  const isUncertain = structuredInfo.isUncertain || answerText.toLowerCase().includes('not sure') || answerText.toLowerCase().includes('unknown');

                  return (
                    <div key={i} style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border-subtle)', opacity: isInactive ? 0.65 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                        <h3 className="history-subheading" style={{ color: 'var(--color-text-secondary)', margin: 0, fontWeight: 600, flex: 1, minWidth: '200px' }}>
                          {structuredInfo.prompt || question.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </h3>

                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {isInactive && (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(15, 23, 42, 0.08)', color: 'var(--color-text-secondary)', border: '1px solid rgba(15, 23, 42, 0.2)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Branch Inactive
                            </span>
                          )}
                          {isSkipped ? (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid var(--color-warning)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Skipped
                            </span>
                          ) : (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', color: '#0891b2', border: '1px solid var(--color-accent)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Self-Reported
                            </span>
                          )}
                          {structuredInfo.isClarified && (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid var(--color-verify)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Clarified
                            </span>
                          )}
                          {structuredInfo.isCorrected && (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(15, 23, 42, 0.08)', color: 'var(--color-navy)', border: '1px solid var(--color-navy)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Corrected
                            </span>
                          )}
                          {isUncertain && (
                            <span className="verification-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid var(--color-warning)', fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                              Uncertain
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="clinical-list-item" style={{ margin: 0, wordBreak: 'break-word' }}>
                        {isSkipped ? (
                          <em style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>(No answer provided)</em>
                        ) : (
                          answerText
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </DoctorSectionCard>
          ) : (
            <div className="doctor-empty-state" style={{ marginTop: 0 }}>
              <span className="empty-icon">📝</span>
              <h3 className="empty-title">No Intake Responses</h3>
              <p className="empty-desc">The patient has not completed the intake questionnaire.</p>
            </div>
          )}

          {/* AYUSH / Ayurveda History Section (Dashavidha Pariksha) */}
          {(caseDetail.intakeAnswers?.ayush || caseDetail.intakeAnswers?.consultation_type === 'ayush' || Object.keys(caseDetail.intakeAnswers || {}).some(k => k.startsWith('ayush_'))) && (
            <div style={{ marginTop: '2rem' }}>
              <DoctorSectionCard title="Ayurveda History (Dashavidha Pariksha)" tag="AYUSH Pathway">
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px' }}>
                  <strong style={{ color: '#92400e', display: 'block', fontSize: '0.85rem' }}>
                    ⚠️ Draft Questionnaire: Requires Review by a Qualified Ayurvedic Practitioner
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#78350f' }}>
                    Patient-reported Ayurvedic observations only. AI does not produce a Prakriti or Ayurvedic diagnosis.
                  </span>
                </div>

                <div className="history-subsection">
                  {Object.entries({
                    prakriti: "Prakriti (Natural Constitution)",
                    vikriti: "Vikriti (Current Imbalance)",
                    sara: "Sara (Tissue Excellence / Vitality)",
                    samhanana: "Samhanana (Body Compactness)",
                    pramana: "Pramana (Anthropometric Proportions)",
                    satmya: "Satmya (Dietary & Environmental Adaptability)",
                    sattva: "Sattva (Mental Strength & Resilience)",
                    ahara_shakti: "Ahara Shakti (Food Intake & Digestion Capacity)",
                    vyayama_shakti: "Vyayama Shakti (Physical Endurance)",
                    vaya: "Vaya (Age & Life Stage)",
                    agni: "Agni (Digestive & Metabolic Fire)",
                    koshtha: "Koshtha (Bowel Habit & Gastrointestinal Tendency)",
                    ahara_vihara: "Ahara-Vihara (Dietary & Lifestyle Habits)",
                    nidana: "Nidana (Perceived Causes & Triggers)",
                  }).map(([key, label]) => {
                    const ayushAnswers = (caseDetail.intakeAnswers?.ayush as Record<string, any>) || {};
                    const rawVal = ayushAnswers[key] || caseDetail.intakeAnswers?.[`ayush_${key}`];
                    const valText = typeof rawVal === 'string' ? rawVal : (rawVal?.value || rawVal?.originalValue || '');
                    return (
                      <div key={key} style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-navy)', fontWeight: 600 }}>{label}</h4>
                          <span className="verification-badge" style={{ backgroundColor: valText ? 'rgba(6, 182, 212, 0.1)' : 'rgba(15, 23, 42, 0.05)', color: valText ? '#0891b2' : 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontSize: '0.75rem' }}>
                            {valText ? 'Patient-Reported' : 'Not Provided'}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: valText ? 'var(--color-text)' : 'var(--color-text-secondary)', fontStyle: valText ? 'normal' : 'italic' }}>
                          {valText || '(Not reported)'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                  <small style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    Draft questionnaire: requires review by a qualified Ayurvedic practitioner.
                  </small>
                </div>
              </DoctorSectionCard>
            </div>
          )}

          {/* Longitudinal History */}
          {unifiedCase && unifiedCase.previousVerified && (
            <div style={{ marginTop: '2rem' }}>
              <DoctorSectionCard title="Longitudinal Changes" tag="Historical Comparison">
                <div className="history-subsection">
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-background-alt)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      <strong>Previous Encounter:</strong> {new Date(unifiedCase.previousVerified.createdAt).toLocaleDateString()} (ID: {unifiedCase.previousVerified.caseId})
                    </p>
                  </div>
                  
                  {/* Symptoms Changes */}
                  {unifiedCase.longitudinalChanges && unifiedCase.longitudinalChanges.symptoms && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 className="history-subheading" style={{ color: 'var(--color-navy)', marginBottom: '0.5rem', fontWeight: 600 }}>Symptom Deltas</h3>
                      {unifiedCase.longitudinalChanges.symptoms.new?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong style={{ color: 'var(--color-danger)' }}>New:</strong> {unifiedCase.longitudinalChanges.symptoms.new.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.symptoms.resolved?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong style={{ color: 'var(--color-verify)' }}>Resolved:</strong> {unifiedCase.longitudinalChanges.symptoms.resolved.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.symptoms.unchanged?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}><strong>Unchanged:</strong> {unifiedCase.longitudinalChanges.symptoms.unchanged.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.symptoms.new?.length === 0 && unifiedCase.longitudinalChanges.symptoms.resolved?.length === 0 && unifiedCase.longitudinalChanges.symptoms.unchanged?.length === 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>No symptoms identified.</p>
                      )}
                    </div>
                  )}

                  {/* Medication Changes */}
                  {unifiedCase.longitudinalChanges && unifiedCase.longitudinalChanges.medications && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 className="history-subheading" style={{ color: 'var(--color-navy)', marginBottom: '0.5rem', fontWeight: 600 }}>Medication Deltas</h3>
                      {unifiedCase.longitudinalChanges.medications.started?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong style={{ color: 'var(--color-danger)' }}>Started:</strong> {unifiedCase.longitudinalChanges.medications.started.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.medications.stopped?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}><strong style={{ color: 'var(--color-verify)' }}>Stopped:</strong> {unifiedCase.longitudinalChanges.medications.stopped.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.medications.unchanged?.length > 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}><strong>Unchanged:</strong> {unifiedCase.longitudinalChanges.medications.unchanged.join(', ')}</p>
                      )}
                      {unifiedCase.longitudinalChanges.medications.started?.length === 0 && unifiedCase.longitudinalChanges.medications.stopped?.length === 0 && unifiedCase.longitudinalChanges.medications.unchanged?.length === 0 && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>No known medication changes.</p>
                      )}
                    </div>
                  )}
                </div>
              </DoctorSectionCard>
            </div>
          )}

          {/* AI Case Summary */}
          <div style={{ marginTop: '2rem' }}>
            <DoctorSectionCard
              title="AI Case Summary"
              tag={(caseDetail.aiSummary as any)?.source === 'offline_demo_fallback' ? "Demo fallback used" : "AI Assisted"}
            >
              {caseDetail.aiSummary ? (
                <div className="history-subsection">
                  {(caseDetail.aiSummary as any)?.source === 'offline_demo_fallback' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <span className="verification-badge" style={{ backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                        ⚙️ Demo fallback used (Rule-based clinical summary)
                      </span>
                    </div>
                  )}
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(23, 92, 222, 0.05)', borderRadius: '8px', border: '1px solid rgba(23, 92, 222, 0.2)' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-navy)', fontStyle: 'italic' }}>
                      ⚠️ <strong>Safety Note:</strong> This summary was generated by AI from patient-provided information. It is not a diagnosis or treatment recommendation.
                    </p>
                  </div>

                  {[
                    { key: 'chiefComplaint', label: 'Chief Complaint' },
                    { key: 'historyOfPresentIllness', label: 'History of Present Illness' },
                    { key: 'pastMedicalHistory', label: 'Past Medical History' },
                    { key: 'pastSurgicalHistory', label: 'Past Surgical History' },
                    { key: 'medications', label: 'Medications' },
                    { key: 'allergies', label: 'Allergies' },
                    { key: 'familyHistory', label: 'Family History' },
                    { key: 'reviewOfSystems', label: 'Review of Systems' }
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
                  {summaryError && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {summaryError}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleGenerateSummary}
                    isLoading={isGeneratingSummary}
                    disabled={isGeneratingSummary}
                    style={{ marginTop: '0.5rem' }}
                  >
                    {isGeneratingSummary ? 'Generating AI Summary...' : 'Generate AI Summary'}
                  </Button>
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>📄</span>
                          <h3 className="history-subheading" style={{ margin: 0, fontWeight: 600 }}>{doc.filename}</h3>
                        </div>
                        {caseDetail && (
                          <a
                            href={getDocumentFileUrl(caseDetail.caseId, doc.id || doc.documentId)}
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
                            Open File ↗
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginLeft: '1.7rem' }}>
                        <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span> •
                        <span style={{ marginLeft: '0.5rem' }}>{doc.mimeType}</span> •
                        <span style={{ marginLeft: '0.5rem' }}>Uploaded: {new Date(doc.createdAt).toLocaleString()}</span>
                      </div>

                      {doc.extractionStatus === 'completed' && doc.medicalEntities && (
                        <div style={{ marginTop: '0.75rem', marginLeft: '1.7rem', padding: '0.75rem', backgroundColor: 'var(--color-background-alt)', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <span>
                              {doc.medicalEntities.source === 'offline_demo_fallback' || doc.extractedText?.includes('[Demo fallback used]')
                                ? '📋 Document Extracted (Demo fallback used)'
                                : '✨ Document Extracted / AI-assisted'}
                            </span>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {(doc.medicalEntities.source === 'offline_demo_fallback' || doc.extractedText?.includes('[Demo fallback used]')) && (
                                <span style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #ffeeba' }}>
                                  Demo fallback used
                                </span>
                              )}
                              <span style={{ color: 'var(--color-text-secondary)', backgroundColor: '#fff3cd', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #ffeeba' }}>
                                Requires Doctor Review
                              </span>
                            </div>
                          </div>
                          {doc.extractedText && (
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                              <strong>Summary:</strong> {doc.extractedText}
                            </div>
                          )}
                          {doc.medicalEntities.diagnoses && doc.medicalEntities.diagnoses.length > 0 && (
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                              <strong>Diagnoses:</strong> {doc.medicalEntities.diagnoses.join(', ')}
                            </div>
                          )}
                          {doc.medicalEntities.medications && doc.medicalEntities.medications.length > 0 && (
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                              <strong>Medications:</strong> {doc.medicalEntities.medications.map((m: any) => [m.name, m.dose, m.frequency].filter(Boolean).join(' — ')).join(', ')}
                            </div>
                          )}
                          {doc.medicalEntities.investigations && doc.medicalEntities.investigations.length > 0 && (
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                              <strong>Investigations:</strong> {doc.medicalEntities.investigations.map((inv: any) => [inv.testName, [inv.value, inv.unit].filter(Boolean).join(' ')].filter(Boolean).join(' — ')).join(', ')}
                            </div>
                          )}
                          {doc.medicalEntities.clinicallyRelevantDates && doc.medicalEntities.clinicallyRelevantDates.length > 0 && (
                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                              <strong>Clinically Relevant Dates:</strong> {doc.medicalEntities.clinicallyRelevantDates.join(', ')}
                            </div>
                          )}
                          {doc.medicalEntities.sourceReference && (
                            <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
                              <em>Source document: {doc.medicalEntities.sourceReference}</em>
                            </div>
                          )}
                        </div>
                      )}
                      {doc.extractionStatus === 'unsupported' && (
                         <div style={{ marginTop: '0.5rem', marginLeft: '1.7rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                           <em>Document extraction unsupported for this format.</em>
                         </div>
                      )}
                      {doc.extractionStatus === 'failed' && (
                         <div style={{ marginTop: '0.5rem', marginLeft: '1.7rem', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
                           <em>Document extraction failed.</em>
                         </div>
                      )}
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
          
          {/* Clinical Intelligence Section */}
          {clinicalIntelligence && (clinicalIntelligence.redFlags?.length > 0 || Object.keys(clinicalIntelligence.medicationIntelligence || {}).length > 0) && (
            <div style={{ marginTop: '2rem' }}>
              <DoctorSectionCard title="Clinical Intelligence" tag="AI Aggregated">
                <div className="history-subsection">
                  {clinicalIntelligence.redFlags?.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 style={{ color: 'var(--color-danger)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>⚠️ Safety Signals</h3>
                      {clinicalIntelligence.redFlags.map((flag: any, i: number) => (
                        <div key={i} style={{ padding: '0.75rem', backgroundColor: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#856404' }}>{flag.category.toUpperCase()} ({flag.severity}):</strong> {flag.explanation}
                          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: '#856404' }}>
                            <em>Evidence: "{flag.evidence}" ({flag.source})</em>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(clinicalIntelligence.medicationIntelligence || {}).length > 0 && (
                    <div>
                      <h3 style={{ color: 'var(--color-primary)', fontSize: '1.1rem', marginBottom: '0.75rem' }}>💊 Medication Intelligence</h3>
                      {Object.entries(clinicalIntelligence.medicationIntelligence).map(([, data]: [string, any], i: number) => (
                        <div key={i} style={{ padding: '0.75rem', backgroundColor: 'var(--color-background-alt)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <strong>{data.name}</strong> 
                          {data.is_duplicate && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', backgroundColor: '#e2e3e5', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Multiple Records</span>}
                          {data.conflict && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', backgroundColor: '#f8d7da', color: '#721c24', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Dosage Conflict</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DoctorSectionCard>
            </div>
          )}
          
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
