import React from 'react';
import type { CaseStatus } from '../types/case';
import { useT } from '../i18n/useT';

interface StatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

interface StatusVisualConfig {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

const STATUS_VISUALS: Record<CaseStatus, StatusVisualConfig> = {
  intake: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-navy)',
  },
  patient_verifying: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'var(--color-warning)',
    color: 'var(--color-navy)',
  },
  doctor_review: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderColor: 'var(--color-navy)',
    color: 'var(--color-navy)',
  },
  completed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'var(--color-verify)',
    color: 'var(--color-verify)',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const { t } = useT();

  const visual = STATUS_VISUALS[status] || {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderColor: 'var(--color-navy)',
    color: 'var(--color-navy)',
  };

  const getLabel = (): string => {
    switch (status) {
      case 'intake':
        return t('statusIntake');
      case 'patient_verifying':
        return t('statusVerifying');
      case 'doctor_review':
        return t('statusDoctorReview');
      case 'completed':
        return t('statusCompleted');
      default:
        return status;
    }
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
        border: `1.5px solid ${visual.borderColor}`,
        backgroundColor: visual.backgroundColor,
        color: visual.color,
        lineHeight: 1.2,
      }}
    >
      {getLabel()}
    </span>
  );
};
