import React from 'react';
import { MmIcon, type MmIconName } from '../ui/MmIcon';

export interface CaseCounts {
  total: number;
  doctorReview: number;
  inProgress: number;
  completed: number;
}

export type CaseFilter = 'all' | 'doctor_review' | 'in_progress' | 'completed';

interface DoctorCaseSummaryProps {
  counts: CaseCounts;
  activeFilter: CaseFilter;
  onSelectFilter: (filter: CaseFilter) => void;
}

export const DoctorCaseSummary: React.FC<DoctorCaseSummaryProps> = ({
  counts,
  activeFilter,
  onSelectFilter,
}) => {
  const cards: Array<{
    id: CaseFilter;
    label: string;
    count: number;
    description: string;
    badgeClass: string;
    tone: 'teal' | 'orange' | 'blue' | 'green';
    icon: MmIconName;
  }> = [
    {
      id: 'all',
      label: 'Total Cases',
      count: counts.total,
      description: 'All pre-consultation records',
      badgeClass: 'summary-total',
      tone: 'teal',
      icon: 'file',
    },
    {
      id: 'doctor_review',
      label: 'Awaiting Review',
      count: counts.doctorReview,
      description: 'Patient-verified & ready',
      badgeClass: 'summary-review',
      tone: 'orange',
      icon: 'clock',
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      count: counts.inProgress,
      description: 'Intake / verification underway',
      badgeClass: 'summary-progress',
      tone: 'blue',
      icon: 'spark',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: counts.completed,
      description: 'Consultations finished',
      badgeClass: 'summary-completed',
      tone: 'green',
      icon: 'check',
    },
  ];

  return (
    <div className="doctor-summary-grid stats-grid mm-summary-grid" role="region" aria-label="Cases Overview Summary">
      {cards.map((card) => {
        const isSelected = activeFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            className={`doctor-summary-card stat-card ${card.tone} mm-stat-card ${isSelected ? 'active' : ''} ${card.badgeClass}`}
            onClick={() => onSelectFilter(card.id)}
            aria-pressed={isSelected}
          >
            <div className="stat-top summary-header">
              <span className="stat-icon mm-stat-icon">
                <MmIcon name={card.icon} size={18} />
              </span>
              <span className="mini-chart" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              {isSelected && <span className="summary-active-indicator mm-active-indicator">Selected</span>}
            </div>
            <span className="summary-label">{card.label}</span>
            <strong className="summary-count">{card.count}</strong>
            <small className="summary-desc">{card.description}</small>
          </button>
        );
      })}
    </div>
  );
};
