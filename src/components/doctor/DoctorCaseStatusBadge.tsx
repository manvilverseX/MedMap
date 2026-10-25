import React from 'react';
import type { CaseStatus } from '../../types/case';

interface DoctorCaseStatusBadgeProps {
  status: CaseStatus;
}

const STATUS_CONFIG: Record<CaseStatus, { label: string; className: string; mmTone: string }> = {
  doctor_review: {
    label: 'Doctor Review',
    className: 'badge-status-doctor-review',
    mmTone: 'review',
  },
  patient_verifying: {
    label: 'Patient Verifying',
    className: 'badge-status-patient-verifying',
    mmTone: 'progress',
  },
  intake: {
    label: 'Intake',
    className: 'badge-status-intake',
    mmTone: 'neutral',
  },
  completed: {
    label: 'Completed',
    className: 'badge-status-completed',
    mmTone: 'verified',
  },
};

export const DoctorCaseStatusBadge: React.FC<DoctorCaseStatusBadgeProps> = ({ status }) => {
  const config = STATUS_CONFIG[status] || {
    label: status,
    className: 'badge-status-default',
    mmTone: 'neutral',
  };

  return (
    <span className={`doctor-badge mm-badge mm-badge--${config.mmTone} ${config.className}`}>
      <span className="badge-dot mm-badge__dot" aria-hidden="true" />
      {config.label}
    </span>
  );
};
