import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DoctorCaseSummary, type CaseFilter, type CaseCounts } from '../../components/doctor/DoctorCaseSummary';
import { DoctorCaseFilters } from '../../components/doctor/DoctorCaseFilters';
import { DoctorCaseCard } from '../../components/doctor/DoctorCaseCard';
import { getCases } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { ErrorMessage } from '../../components/ErrorMessage';
import { MmIcon, MmButton } from '../../components/ui';
import '../../components/doctor/doctorDashboard.css';

function calculateCaseCounts(cases: ClinicalCase[]): CaseCounts {
  return {
    total: cases.length,
    doctorReview: cases.filter((c) => c.status === 'doctor_review').length,
    inProgress: cases.filter((c) => c.status === 'intake' || c.status === 'patient_verifying').length,
    completed: cases.filter((c) => c.status === 'completed').length,
  };
}

export function DoctorCasesPage() {
  const [activeFilter, setActiveFilter] = useState<CaseFilter>('all');
  const [cases, setCases] = useState<ClinicalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const data = await getCases();
        setCases(data);
        setError(null);
      } catch (err: any) {
        if (err.message === 'Unauthorized') {
          navigate('/doctor/login');
          return;
        }
        setError(err.message || 'Failed to load cases.');
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, [navigate]);

  const counts = useMemo(() => calculateCaseCounts(cases), [cases]);

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'doctor_review') return c.status === 'doctor_review';
      if (activeFilter === 'in_progress') return c.status === 'intake' || c.status === 'patient_verifying';
      if (activeFilter === 'completed') return c.status === 'completed';
      return true;
    });
  }, [cases, activeFilter]);

  return (
    <div className="doctor-dashboard-container mm-doctor-dashboard">
      {/* Top Header & Navigation */}
      <header className="doctor-header mm-doctor-header">
        <div className="doctor-top-bar mm-doctor-top-bar">
          <div className="doctor-brand-group mm-doctor-brand-group">
            <div className="logo-mark mm-logo-mark" aria-hidden="true">
              <span>+</span>
            </div>
            <Link to="/" className="doctor-brand-title mm-doctor-brand-title">
              MedMap
            </Link>
            <span className="doctor-portal-pill mm-doctor-portal-pill">Doctor Portal</span>
          </div>

          <nav className="doctor-nav-links mm-doctor-nav-links" aria-label="Portal Navigation">
            <Link to="/" className="doctor-nav-link mm-doctor-nav-link">
              <MmIcon name="arrow" size={15} style={{ transform: 'rotate(180deg)' }} />
              Back to Home
            </Link>
          </nav>
        </div>

        <div className="doctor-page-heading-group mm-doctor-heading-group">
          <div>
            <span className="section-kicker mm-section-kicker">Clinical Case Queue</span>
            <h1 className="doctor-page-title mm-doctor-page-title">Pre-Consultation Cases</h1>
            <p className="doctor-page-subtitle mm-doctor-page-subtitle">
              Review patient-verified intake responses and uploaded clinical documents before consultation.
            </p>
          </div>
        </div>
      </header>

      <main>
        {error && (
          <div style={{ padding: '0 0 1.5rem 0' }}>
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* Welcome Summary Strip */}
        <section className="welcome-card mm-welcome-card" aria-label="Clinical workspace overview">
          <div className="welcome-copy mm-welcome-copy">
            <span className="section-kicker mm-section-kicker">
              <i aria-hidden="true" /> Today's Clinical Workspace
            </span>
            <h2>
              Better-prepared consultations<br />
              <em>start before the first question.</em>
            </h2>
            <p>
              MedMap has organized <strong>{cases.length} patient {cases.length === 1 ? 'case' : 'cases'}</strong> for your review.{' '}
              {counts.doctorReview > 0
                ? `${counts.doctorReview} ${counts.doctorReview === 1 ? 'case needs' : 'cases need'} attention before consultation.`
                : 'All current cases are up to date.'}
            </p>
            <div className="welcome-actions mm-welcome-actions">
              <MmButton
                variant="primary"
                onClick={() => setActiveFilter('doctor_review')}
                icon="file"
              >
                Review Prepared Cases ({counts.doctorReview})
              </MmButton>
              <MmButton
                variant="secondary"
                onClick={() => setActiveFilter('all')}
                icon="spark"
              >
                View All Cases ({counts.total})
              </MmButton>
            </div>
          </div>

          <div className="map-visual mm-map-visual" aria-hidden="true">
            <svg viewBox="0 0 420 240">
              <path className="map-fill" d="M30 65 120 38l72 30 82-42 112 38-24 132-94-27-74 36-81-27-83 25Z" />
              <path className="map-line" d="m30 65 83 25 79-22 76 34 118-38M113 90v88M192 68v137M268 102v67" />
              <path className="route-line" d="M70 155c58-77 91 22 143-40 35-42 76-27 117 21" />
              <circle cx="70" cy="155" r="7" />
              <circle cx="213" cy="115" r="7" />
              <circle cx="330" cy="136" r="7" />
              <path className="pin" d="M213 76c-14 0-25 11-25 25 0 19 25 42 25 42s25-23 25-42c0-14-11-25-25-25Z" />
              <circle className="pin-hole" cx="213" cy="101" r="7" />
            </svg>
            <div className="case-folder mm-case-folder">
              <span className="folder-tab" />
              <span className="folder-cross">+</span>
              <strong>MedMap</strong>
              <small>Clinical Brief</small>
            </div>
            <span className="scribble one">structured</span>
            <span className="scribble two">verified</span>
          </div>
        </section>

        {/* Case Metrics Summary */}
        <DoctorCaseSummary
          counts={counts}
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
        />

        {/* Filter Controls */}
        <DoctorCaseFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={counts}
        />

        {/* Cases Section */}
        <section className="doctor-cases-section mm-doctor-cases-section" aria-labelledby="cases-list-heading">
          <div className="cases-section-header mm-cases-section-header">
            <h2 id="cases-list-heading" className="cases-section-title">
              {activeFilter === 'all' && 'All Cases'}
              {activeFilter === 'doctor_review' && 'Awaiting Doctor Review'}
              {activeFilter === 'in_progress' && 'In Progress Cases'}
              {activeFilter === 'completed' && 'Completed Cases'}
            </h2>
            <span className="cases-count-label">
              Showing {filteredCases.length} of {cases.length} cases
            </span>
          </div>

          {loading ? (
            <div className="doctor-empty-state mm-doctor-empty-state" role="status" aria-live="polite">
              <span className="spinner" style={{ borderTopColor: 'var(--mm-teal)' }} />
              <h3 className="empty-title">Loading Cases...</h3>
            </div>
          ) : filteredCases.length > 0 ? (
            <div className="cases-list-grid mm-cases-list-grid">
              {filteredCases.map((caseItem) => (
                <DoctorCaseCard key={caseItem.caseId} caseItem={caseItem} />
              ))}
            </div>
          ) : (
            <div className="doctor-empty-state mm-doctor-empty-state" role="region" aria-label="No cases found">
              <span className="empty-icon" aria-hidden="true">
                <MmIcon name="file" size={36} />
              </span>
              <h3 className="empty-title">No Cases Found</h3>
              <p className="empty-desc">
                There are currently no cases matching the selected filter.
              </p>
              <button
                type="button"
                className="btn-reset-filter mm-button mm-button--secondary"
                onClick={() => setActiveFilter('all')}
              >
                Reset Filter to All Cases
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
