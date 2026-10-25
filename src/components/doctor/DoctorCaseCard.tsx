import React from 'react';
import { Link } from 'react-router-dom';
import type { ClinicalCase } from '../../types/case';
import { DoctorCaseStatusBadge } from './DoctorCaseStatusBadge';
import { MmIcon } from '../ui/MmIcon';

interface DoctorCaseCardProps {
  caseItem: ClinicalCase;
}

export const DoctorCaseCard: React.FC<DoctorCaseCardProps> = ({ caseItem }) => {
  const formattedDate = new Date(caseItem.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const getInitials = (id: string) => {
    if (!id) return 'PT';
    const cleaned = id.replace(/[^a-zA-Z0-9]/g, '');
    return cleaned.slice(0, 2).toUpperCase() || 'PT';
  };

  const hasTranslationIssue =
    caseItem.derivedClinicalData?.translationScreeningIncomplete ||
    Object.values(caseItem.intakeAnswers || {}).some(
      (a: any) =>
        typeof a === 'object' &&
        (a?.translationFailed === true || (a?.translated === false && a?.lang && a?.lang !== 'en'))
    );

  return (
    <article className="doctor-case-card mm-case-card" aria-labelledby={`case-title-${caseItem.caseId}`}>
      <div className="case-card-header mm-case-card-header">
        <div className="case-id-group mm-case-id-group">
          <span className="avatar avatar-1 mm-case-avatar" aria-hidden="true">
            {getInitials(caseItem.patientId)}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span className="case-id-tag mm-case-id-tag">{caseItem.caseId}</span>
              {caseItem.intakeAnswers?.consultation_type && (
                <span className="mm-badge mm-badge--neutral" style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}>
                  {caseItem.intakeAnswers.consultation_type}
                </span>
              )}
            </div>
            <h3 id={`case-title-${caseItem.caseId}`} className="case-patient-name" style={{ margin: '0.25rem 0 0', fontSize: '1.08rem' }}>
              Patient ID: {caseItem.patientId}
            </h3>
          </div>
        </div>

        <div className="case-badges mm-case-badges">
          {hasTranslationIssue && (
            <span
              className="badge-manual-review-needed mm-badge mm-badge--review"
              title="Automatic red-flag screening incomplete - translation failure"
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.25rem 0.55rem',
                backgroundColor: 'var(--mm-coral-pale)',
                color: '#b94b29',
                border: '1.5px solid var(--mm-coral)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <MmIcon name="alert" size={13} />
              ⚠️ Manual review needed
            </span>
          )}
          <DoctorCaseStatusBadge status={caseItem.status} />
        </div>
      </div>

      <div className="case-demographics mm-case-demographics">
        {caseItem.language && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <MmIcon name="language" size={14} />
            Language: <strong>{caseItem.language}</strong>
          </span>
        )}
      </div>

      <div className="case-meta-row mm-case-meta-row">
        <div className="case-meta-indicators mm-case-meta-indicators">
          <span className="meta-date mm-meta-date" title="Last Updated">
            Updated: {formattedDate}
          </span>
        </div>

        <div className="case-actions mm-case-actions">
          <Link
            to={`/doctor/cases/${caseItem.caseId}`}
            className="btn-open-case mm-button mm-button--primary mm-btn-open-case"
            aria-label={`Open pre-consultation brief for case ${caseItem.caseId}, patient ${caseItem.patientId}`}
          >
            <span>Open Case Brief</span>
            <MmIcon name="arrow" size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
};
