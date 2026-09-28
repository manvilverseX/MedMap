import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DoctorCaseSummary, type CaseFilter, type CaseCounts } from '../../components/doctor/DoctorCaseSummary';
import { DoctorCaseFilters } from '../../components/doctor/DoctorCaseFilters';
import { DoctorCaseCard } from '../../components/doctor/DoctorCaseCard';
import { getCases } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useNavigate } from 'react-router-dom';
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
    <div className="doctor-dashboard-container">
      {/* Top Header & Navigation */}
      <header className="doctor-header">
        <div className="doctor-top-bar">
          <div className="doctor-brand-group">
            <Link to="/" className="doctor-brand-title">
              MedMap
            </Link>
            <span className="doctor-portal-pill">Doctor Portal</span>
          </div>

          <nav className="doctor-nav-links" aria-label="Portal Navigation">
            <Link to="/" className="doctor-nav-link">
              ← Back to Home
            </Link>
          </nav>
        </div>

        <div className="doctor-page-heading-group">
          <div>
            <h1 className="doctor-page-title">Pre-Consultation Cases</h1>
            <p className="doctor-page-subtitle">
              Review patient-verified intake responses and uploaded clinical documents before consultation.
            </p>
          </div>
        </div>
      </header>

      <main>
        {error && (
          <div style={{ padding: '0 2rem' }}>
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </div>
        )}

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
        <section className="doctor-cases-section" aria-labelledby="cases-list-heading">
          <div className="cases-section-header">
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
            <div className="doctor-empty-state" role="status" aria-live="polite">
              <span className="spinner" style={{ borderTopColor: 'var(--color-primary)' }}></span>
              <h3 className="empty-title">Loading Cases...</h3>
            </div>
          ) : filteredCases.length > 0 ? (
            <div className="cases-list-grid">
              {filteredCases.map((caseItem) => (
                <DoctorCaseCard key={caseItem.caseId} caseItem={caseItem} />
              ))}
            </div>
          ) : (
            <div className="doctor-empty-state" role="region" aria-label="No cases found">
              <span className="empty-icon" aria-hidden="true">📋</span>
              <h3 className="empty-title">No Cases Found</h3>
              <p className="empty-desc">
                There are currently no cases matching the selected filter.
              </p>
              <button
                type="button"
                className="btn-reset-filter"
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

