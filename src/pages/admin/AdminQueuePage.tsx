import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAdminQueue, acknowledgeAdminAlert } from '../../utils/api';
import type { AdminQueueResponse } from '../../utils/api';
import { DoctorCaseStatusBadge } from '../../components/doctor/DoctorCaseStatusBadge';
import { MmCard, MmButton, MmIcon, MmBadge } from '../../components/ui';

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
    <div className="mm-admin-queue-page" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem', minHeight: '100vh' }}>
      {/* Top Header & Navigation */}
      <header
        className="mm-admin-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '1.25rem',
          borderBottom: '1.5px solid var(--mm-line)',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'var(--mm-teal)',
              color: 'var(--mm-white)',
              border: '1.5px solid var(--mm-ink)',
              boxShadow: '2px 2px 0 var(--mm-ink)',
              fontSize: '1.4rem',
              fontWeight: 800,
            }}
            aria-hidden="true"
          >
            +
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link to="/" style={{ textDecoration: 'none', color: 'var(--mm-ink)', fontSize: '1.35rem', fontWeight: 800 }}>
                MedMap
              </Link>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  padding: '0.2rem 0.55rem',
                  borderRadius: 'var(--mm-radius-pill)',
                  backgroundColor: 'var(--mm-paper-deep)',
                  color: 'var(--mm-ink-soft)',
                  border: '1px solid var(--mm-line)',
                  textTransform: 'uppercase',
                }}
              >
                Hospital Operations
              </span>
            </div>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--mm-ink-soft)' }}>
              Clinical Intake & Emergency Triage Queue
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.7rem',
              backgroundColor: 'var(--mm-teal-pale)',
              color: 'var(--mm-teal-dark)',
              borderRadius: 'var(--mm-radius-pill)',
              border: '1px solid rgba(30, 156, 160, 0.35)',
            }}
          >
            Role: Admin (Triage)
          </span>
          <MmButton
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            icon="logout"
            style={{
              border: '1px solid var(--mm-line)',
              backgroundColor: 'var(--mm-white)',
            }}
          >
            Sign Out
          </MmButton>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.85rem 1.15rem',
            backgroundColor: 'var(--mm-coral-pale)',
            color: '#8a2c11',
            border: '1.5px solid var(--mm-coral)',
            borderRadius: 'var(--mm-radius-md)',
            marginBottom: '1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{error}</span>
          <MmButton variant="secondary" size="sm" onClick={fetchQueue}>
            Retry
          </MmButton>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="spinner" style={{ borderTopColor: 'var(--mm-teal)', width: '32px', height: '32px' }} />
          <p style={{ marginTop: '1.25rem', color: 'var(--mm-ink-soft)', fontSize: '0.92rem', fontWeight: 600 }}>
            Loading Hospital Triage Queue...
          </p>
        </div>
      ) : data ? (
        <>
          {/* Status Metric Counts */}
          <section aria-label="Case Status Counts" style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '0.82rem',
                color: 'var(--mm-ink-soft)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontWeight: 800,
                margin: '0 0 0.85rem',
              }}
            >
              Active Cases by Workflow Status
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '1rem',
              }}
            >
              {[
                { label: 'Intake in Progress', count: data.statusCounts.intake, color: 'var(--mm-blue)', bg: 'rgba(76, 130, 172, 0.08)' },
                { label: 'Patient Verifying', count: data.statusCounts.patient_verifying, color: 'var(--mm-gold)', bg: 'rgba(214, 168, 60, 0.12)' },
                { label: 'Doctor Review', count: data.statusCounts.doctor_review, color: 'var(--mm-teal)', bg: 'var(--mm-teal-pale)' },
                { label: 'Finalized / Completed', count: data.statusCounts.completed, color: 'var(--mm-green)', bg: 'rgba(92, 156, 117, 0.12)' },
                { label: 'Total Cases', count: data.statusCounts.total, color: 'var(--mm-ink)', bg: 'var(--mm-white)' },
              ].map((m, idx) => (
                <MmCard
                  key={idx}
                  variant="default"
                  style={{
                    backgroundColor: m.bg,
                    padding: '1.15rem 1.25rem',
                    border: '1.5px solid var(--mm-ink)',
                    boxShadow: '3px 3px 0 var(--mm-ink)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--mm-ink-soft)',
                      display: 'block',
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {m.label}
                  </span>
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 800,
                      color: m.color,
                      marginTop: '0.35rem',
                      lineHeight: 1.1,
                      fontFamily: 'var(--mm-font-body)',
                    }}
                  >
                    {m.count}
                  </div>
                </MmCard>
              ))}
            </div>
          </section>

          {/* Prominent Red-Flag Alerts Panel for Triage Staff */}
          <section
            aria-label="High Priority Clinical Safety Signals"
            style={{
              marginBottom: '2.25rem',
            }}
          >
            <MmCard
              variant="accent-coral"
              style={{
                backgroundColor: 'var(--mm-white)',
                border: '2px solid var(--mm-coral)',
                boxShadow: '4px 5px 0 var(--mm-coral)',
                padding: '1.35rem 1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1.5px dashed var(--mm-coral)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--mm-coral-pale)',
                      color: 'var(--mm-coral)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1.5px solid var(--mm-coral)',
                    }}
                  >
                    <MmIcon name="alert" size={18} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#8a2c11', fontWeight: 800 }}>
                      High-Priority Clinical Safety Signals ({data.redFlagAlerts.length})
                    </h2>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#8a2c11',
                    fontWeight: 600,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    backgroundColor: 'var(--mm-coral-pale)',
                  }}
                >
                  Clinical intelligence engine flags requiring triage acknowledgment
                </span>
              </div>

              {data.redFlagAlerts.length === 0 ? (
                <div
                  style={{
                    padding: '1.1rem 1.25rem',
                    backgroundColor: 'rgba(92, 156, 117, 0.1)',
                    border: '1.5px solid var(--mm-green)',
                    borderRadius: 'var(--mm-radius-md)',
                    color: '#1e5c36',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <MmIcon name="check" size={18} style={{ color: 'var(--mm-green)' }} />
                  <span>No unacknowledged clinical safety signals. All triage flags are clear.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {data.redFlagAlerts.map((alert, idx) => {
                    const alertKey = `${alert.caseId}:${alert.category}`;
                    const isAcking = acknowledgingKey === alertKey;

                    return (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: alert.acknowledged ? 'var(--mm-paper)' : 'var(--mm-coral-pale)',
                          border: alert.acknowledged ? '1.5px solid var(--mm-line)' : '1.5px solid var(--mm-coral)',
                          borderRadius: 'var(--mm-radius-md)',
                          padding: '1rem 1.15rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.85rem',
                          opacity: alert.acknowledged ? 0.8 : 1,
                          boxShadow: alert.acknowledged ? 'none' : '2px 2px 0 var(--mm-coral)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '260px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '0.2rem 0.55rem',
                                borderRadius: 'var(--mm-radius-sm)',
                                backgroundColor: alert.acknowledged ? 'var(--mm-paper-deep)' : '#8a2c11',
                                color: alert.acknowledged ? 'var(--mm-ink-soft)' : 'var(--mm-white)',
                                letterSpacing: '0.5px',
                              }}
                            >
                              {alert.category.toUpperCase()} ({alert.severity})
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mm-ink)' }}>
                              Case: {alert.caseId} (Patient: {alert.patientId})
                            </span>
                          </div>
                          <p style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#521b0d', fontWeight: 600 }}>
                            {alert.explanation}
                          </p>
                          {alert.evidence && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--mm-ink-soft)', fontStyle: 'italic', display: 'block' }}>
                              Evidence: "{alert.evidence}"
                            </span>
                          )}
                        </div>

                        <div>
                          {alert.acknowledged ? (
                            <span
                              style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                padding: '0.35rem 0.75rem',
                                borderRadius: 'var(--mm-radius-pill)',
                                backgroundColor: 'rgba(92, 156, 117, 0.15)',
                                color: '#1e5c36',
                                border: '1px solid var(--mm-green)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              <MmIcon name="check" size={14} />
                              Acknowledged
                            </span>
                          ) : (
                            <MmButton
                              variant="danger"
                              size="sm"
                              onClick={() => handleAcknowledge(alert.caseId, alert.category, alert.explanation)}
                              disabled={isAcking}
                            >
                              {isAcking ? 'Acknowledging...' : 'Acknowledge Alert'}
                            </MmButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </MmCard>
          </section>

          {/* Queue Filter Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--mm-ink)', fontWeight: 800 }}>
              Triage Intake Queue ({filteredCases.length})
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--mm-ink)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Status:
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    border: '1.5px solid var(--mm-ink)',
                    backgroundColor: 'var(--mm-white)',
                    color: 'var(--mm-ink)',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--mm-font-body)',
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="intake">Intake</option>
                  <option value="patient_verifying">Patient Verifying</option>
                  <option value="doctor_review">Doctor Review</option>
                  <option value="completed">Completed</option>
                </select>
              </label>

              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--mm-ink)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Pathway:
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    border: '1.5px solid var(--mm-ink)',
                    backgroundColor: 'var(--mm-white)',
                    color: 'var(--mm-ink)',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--mm-font-body)',
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Pathways</option>
                  <option value="general">General Clinical</option>
                  <option value="ayush">AYUSH / Ayurveda</option>
                </select>
              </label>

              <label
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--mm-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  padding: '0.45rem 0.75rem',
                  backgroundColor: onlyRedFlags ? 'var(--mm-coral-pale)' : 'var(--mm-white)',
                  border: onlyRedFlags ? '1.5px solid var(--mm-coral)' : '1.5px solid var(--mm-ink)',
                  borderRadius: 'var(--mm-radius-sm)',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={onlyRedFlags}
                  onChange={(e) => setOnlyRedFlags(e.target.checked)}
                  style={{ accentColor: 'var(--mm-coral)', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                Red-Flag Cases Only
              </label>
            </div>
          </div>

          {/* Queue Table */}
          <div
            style={{
              backgroundColor: 'var(--mm-white)',
              borderRadius: 'var(--mm-radius-lg)',
              border: '1.5px solid var(--mm-ink)',
              overflowX: 'auto',
              boxShadow: '4px 5px 0 rgba(8, 45, 73, 0.08)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--mm-paper-deep)', borderBottom: '1.5px solid var(--mm-ink)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Case ID</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Patient</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Language</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Pathway</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Safety Signals</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Complaint Summary</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mm-ink-soft)', fontWeight: 600 }}>
                      No cases match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr
                      key={c.caseId}
                      style={{
                        borderBottom: '1px solid var(--mm-line)',
                        backgroundColor: c.hasRedFlags ? 'rgba(236, 117, 80, 0.08)' : 'transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: 'var(--mm-ink)' }}>
                        {c.caseId}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--mm-ink-soft)', fontWeight: 600 }}>
                        {c.patientId}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--mm-ink)', textTransform: 'capitalize' }}>
                        {c.language}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <MmBadge
                          tone={c.consultationType === 'ayush' ? 'verified' : 'neutral'}
                        >
                          {c.consultationType === 'ayush' ? 'AYUSH' : 'General'}
                        </MmBadge>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <DoctorCaseStatusBadge status={c.status as any} />
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {c.hasRedFlags ? (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.55rem',
                              borderRadius: 'var(--mm-radius-sm)',
                              backgroundColor: 'var(--mm-coral-pale)',
                              color: '#8a2c11',
                              border: '1px solid var(--mm-coral)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            ⚠️ {c.redFlagCount} Alert{c.redFlagCount > 1 ? 's' : ''}
                          </span>
                        ) : (c as any).translationScreeningIncomplete ? (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.55rem',
                              borderRadius: 'var(--mm-radius-sm)',
                              backgroundColor: 'var(--mm-coral-pale)',
                              color: '#8a2c11',
                              border: '1px solid var(--mm-coral)',
                            }}
                          >
                            ⚠️ Manual review needed
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: 'var(--mm-green)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            ✓ Clear
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', maxWidth: '300px', color: 'var(--mm-ink-soft)' }}>
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.85rem',
                          }}
                        >
                          {c.chiefComplaint}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--mm-ink-soft)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
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

