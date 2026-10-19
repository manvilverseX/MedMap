import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminQueue, acknowledgeAdminAlert } from '../../utils/api';
import type { AdminQueueResponse } from '../../utils/api';
import { Button } from '../../components/Button';
import { DoctorCaseStatusBadge } from '../../components/doctor/DoctorCaseStatusBadge';

export function AdminQueuePage() {
  const [data, setData] = useState<AdminQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [onlyRedFlags, setOnlyRedFlags] = useState<boolean>(false);
  const [acknowledgingKey, setAcknowledgingKey] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchQueue = async () => {
    try {
      const result = await getAdminQueue();
      setData(result);
      setError(null);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        localStorage.removeItem('medmap_token');
        navigate('/admin/login');
        return;
      }
      setError(err.message || 'Failed to load hospital operations queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('medmap_token');
    localStorage.removeItem('medmap_role');
    navigate('/admin/login');
  };

  const handleAcknowledge = async (caseId: string, category: string, explanation: string) => {
    const key = `${caseId}:${category}`;
    setAcknowledgingKey(key);
    try {
      await acknowledgeAdminAlert(caseId, category, explanation);
      await fetchQueue();
    } catch (err: any) {
      alert(`Failed to acknowledge alert: ${err.message || 'Unknown error'}`);
    } finally {
      setAcknowledgingKey(null);
    }
  };

  const filteredCases = (data?.cases || []).filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.consultationType !== typeFilter) return false;
    if (onlyRedFlags && !c.hasRedFlags) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* Top Navigation */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.75rem' }}>🏥</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--color-navy)' }}>
              Hospital Operations & Triage Queue
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              MedMap Clinical Intake Management (Triage Staff)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.25rem 0.6rem',
            backgroundColor: '#e0f2fe',
            color: '#0369a1',
            borderRadius: '4px',
            border: '1px solid #bae6fd',
          }}>
            Role: Admin (Triage)
          </span>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '0.35rem 0.8rem',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              fontSize: '0.82rem',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '0.85rem 1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="outline" onClick={fetchQueue} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="spinner" style={{ borderTopColor: 'var(--color-primary)' }}></span>
          <p style={{ marginTop: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Loading Hospital Triage Queue...
          </p>
        </div>
      ) : data ? (
        <>
          {/* Status Metric Counts (No invented charts or analytics) */}
          <section aria-label="Case Status Counts" style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.65rem' }}>
              Active Cases by Workflow Status
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
            }}>
              {[
                { label: 'Intake in Progress', count: data.statusCounts.intake, color: '#3b82f6', bg: '#eff6ff' },
                { label: 'Patient Verifying', count: data.statusCounts.patient_verifying, color: '#f59e0b', bg: '#fffbeb' },
                { label: 'Doctor Review', count: data.statusCounts.doctor_review, color: '#8b5cf6', bg: '#f5f3ff' },
                { label: 'Finalized / Completed', count: data.statusCounts.completed, color: '#10b981', bg: '#ecfdf5' },
                { label: 'Total Cases', count: data.statusCounts.total, color: 'var(--color-navy)', bg: '#f8fafc' },
              ].map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: m.bg,
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: '8px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>
                    {m.label}
                  </span>
                  <div style={{ fontSize: '1.85rem', fontWeight: 700, color: m.color, marginTop: '0.25rem' }}>
                    {m.count}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Prominent Red-Flag Alerts Panel for Triage Staff */}
          <section
            aria-label="High Priority Clinical Safety Signals"
            style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '1.25rem',
              marginBottom: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#92400e' }}>
                  High-Priority Clinical Safety Signals ({data.redFlagAlerts.length})
                </h2>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#b45309', fontStyle: 'italic' }}>
                Clinical intelligence engine flags requiring triage acknowledgment
              </span>
            </div>

            {data.redFlagAlerts.length === 0 ? (
              <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.85rem' }}>
                ✓ No unacknowledged clinical safety signals. All triage flags are clear.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.redFlagAlerts.map((alert, idx) => {
                  const alertKey = `${alert.caseId}:${alert.category}`;
                  const isAcking = acknowledgingKey === alertKey;

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: alert.acknowledged ? '#f9fafb' : '#fff',
                        border: alert.acknowledged ? '1px solid #e5e7eb' : '1px solid #fcd34d',
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        opacity: alert.acknowledged ? 0.75 : 1,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            backgroundColor: alert.acknowledged ? '#e5e7eb' : '#fee2e2',
                            color: alert.acknowledged ? '#4b5563' : '#991b1b',
                          }}>
                            {alert.category.toUpperCase()} ({alert.severity})
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-navy)' }}>
                            Case: {alert.caseId} (Patient: {alert.patientId})
                          </span>
                        </div>
                        <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: '#78350f' }}>
                          {alert.explanation}
                        </p>
                        {alert.evidence && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', display: 'block' }}>
                            Evidence: "{alert.evidence}"
                          </span>
                        )}
                      </div>

                      <div>
                        {alert.acknowledged ? (
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.25rem 0.6rem',
                            borderRadius: '4px',
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            border: '1px solid #bbf7d0',
                          }}>
                            ✓ Acknowledged
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            onClick={() => handleAcknowledge(alert.caseId, alert.category, alert.explanation)}
                            isLoading={isAcking}
                            disabled={isAcking}
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.35rem 0.75rem',
                              backgroundColor: '#d97706',
                              borderColor: '#d97706',
                            }}
                          >
                            Acknowledge Alert
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Queue Filter Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-navy)' }}>
              Triage Intake Queue ({filteredCases.length})
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                Status:
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.82rem' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="intake">Intake</option>
                  <option value="patient_verifying">Patient Verifying</option>
                  <option value="doctor_review">Doctor Review</option>
                  <option value="completed">Completed</option>
                </select>
              </label>

              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                Pathway:
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.82rem' }}
                >
                  <option value="all">All Pathways</option>
                  <option value="general">General Clinical</option>
                  <option value="ayush">AYUSH / Ayurveda</option>
                </select>
              </label>

              <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyRedFlags}
                  onChange={(e) => setOnlyRedFlags(e.target.checked)}
                />
                Red-Flag Cases Only
              </label>
            </div>
          </div>

          {/* Queue Table */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            overflowX: 'auto',
            boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-background-alt)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Case ID</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Patient</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Language</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Pathway</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Safety Signals</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Complaint Summary</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No cases match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr
                      key={c.caseId}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle, #f1f5f9)',
                        backgroundColor: c.hasRedFlags ? 'rgba(254, 242, 242, 0.35)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-navy)' }}>
                        {c.caseId}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)' }}>
                        {c.patientId}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {c.language}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: c.consultationType === 'ayush' ? '#f0fdf4' : '#f8fafc',
                          color: c.consultationType === 'ayush' ? '#166534' : 'var(--color-navy)',
                          border: c.consultationType === 'ayush' ? '1px solid #bbf7d0' : '1px solid var(--color-border)',
                        }}>
                          {c.consultationType === 'ayush' ? 'AYUSH' : 'General'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <DoctorCaseStatusBadge status={c.status as any} />
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {c.hasRedFlags ? (
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fecaca',
                          }}>
                            ⚠️ {c.redFlagCount} Alert{c.redFlagCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                            ✓ Clear
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '280px', color: 'var(--color-text-secondary)' }}>
                        <div style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {c.chiefComplaint}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {c.lastUpdated ? new Date(c.lastUpdated).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
