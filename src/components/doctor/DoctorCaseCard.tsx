import React from 'react';
import { Link } from 'react-router-dom';
import type { ClinicalCase } from '../../types/case';
import { DoctorCaseStatusBadge } from './DoctorCaseStatusBadge';

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

  return (
    <article className="doctor-case-card" aria-labelledby={`case-title-${caseItem.caseId}`}>
      <div className="case-card-header">
        <div className="case-id-group">
          <span className="case-id-tag">{caseItem.caseId}</span>
          <h3 id={`case-title-${caseItem.caseId}`} className="case-patient-name" style={{ fontSize: '1.1rem', margin: 0 }}>
            Patient ID: {caseItem.patientId}
          </h3>
        </div>
        <div className="case-badges">
          <DoctorCaseStatusBadge status={caseItem.status} />
        </div>
      </div>

      <div className="case-demographics" style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
        {caseItem.language && <span>Language: {caseItem.language}</span>}
      </div>

      <div className="case-meta-row" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="case-meta-indicators">
          <span className="meta-date" title="Last Updated" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Updated: {formattedDate}
          </span>
        </div>

        <div className="case-actions">
          <Link
            to={`/doctor/cases/${caseItem.caseId}`}
            className="btn-open-case"
            aria-label={`Open pre-consultation brief for case ${caseItem.caseId}, patient ${caseItem.patientId}`}
          >
            Open Case Brief →
          </Link>
        </div>
      </div>
    </article>
  );
};
