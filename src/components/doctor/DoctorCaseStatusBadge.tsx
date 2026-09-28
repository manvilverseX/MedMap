import React from 'react';
import type { CaseStatus } from '../../types/case';

interface DoctorCaseStatusBadgeProps {
  status: CaseStatus;
}

const STATUS_CONFIG: Record<CaseStatus, { label: string; className: string }> = {
  doctor_review: {
    label: 'Doctor Review',
    className: 'badge-status-doctor-review',
  },
  patient_verifying: {
    label: 'Patient Verifying',
    className: 'badge-status-patient-verifying',
  },
  intake: {
    label: 'Intake',
    className: 'badge-status-intake',
  },
  completed: {
    label: 'Completed',
    className: 'badge-status-completed',
  },
};

export const DoctorCaseStatusBadge: React.FC<DoctorCaseStatusBadgeProps> = ({ status }) => {
  const config = STATUS_CONFIG[status] || {
    label: status,
    className: 'badge-status-default',
  };

  return (
    <span className={`doctor-badge ${config.className}`}>
      <span className="badge-dot" aria-hidden="true" />
      {config.label}
    </span>
  );
};

