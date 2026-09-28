import React from 'react';
import type { CaseStatus } from '../types/case';

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

interface StatusConfig {
  label: string;
  backgroundColor: string;
  borderColor: string;
  color: string;
}

const STATUS_CONFIGS: Record<CaseStatus, StatusConfig> = {
  intake: {
    label: 'Intake in Progress',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-navy)',
  },
  patient_verifying: {
    label: 'Patient Verifying',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'var(--color-warning)',
    color: 'var(--color-navy)',
  },
  doctor_review: {
    label: 'Doctor Review',
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderColor: 'var(--color-navy)',
    color: 'var(--color-navy)',
  },
  completed: {
    label: 'Completed',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'var(--color-verify)',
    color: 'var(--color-verify)',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = STATUS_CONFIGS[status] || {
    label: status,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderColor: 'var(--color-navy)',
    color: 'var(--color-navy)',
  };

  return (
    <span
      className={`status-badge ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.65rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        borderRadius: '9999px',
        border: `1.5px solid ${config.borderColor}`,
        backgroundColor: config.backgroundColor,
        color: config.color,
        lineHeight: 1.2,
      }}
    >
      {config.label}
    </span>
  );
};
