import React from 'react';
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
  }> = [
    {
      id: 'all',
      label: 'Total Cases',
      count: counts.total,
      description: 'All pre-consultation records',
      badgeClass: 'summary-total',
    },
    {
      id: 'doctor_review',
      label: 'Awaiting Review',
      count: counts.doctorReview,
      description: 'Patient-verified & ready',
      badgeClass: 'summary-review',
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      count: counts.inProgress,
      description: 'Intake / verification underway',
      badgeClass: 'summary-progress',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: counts.completed,
      description: 'Consultations finished',
      badgeClass: 'summary-completed',
    },
  ];

  return (
    <div className="doctor-summary-grid" role="region" aria-label="Cases Overview Summary">
      {cards.map((card) => {
        const isSelected = activeFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            className={`doctor-summary-card ${isSelected ? 'active' : ''} ${card.badgeClass}`}
            onClick={() => onSelectFilter(card.id)}
            aria-pressed={isSelected}
          >
            <div className="summary-header">
              <span className="summary-label">{card.label}</span>
              {isSelected && <span className="summary-active-indicator">Selected</span>}
            </div>
            <div className="summary-count">{card.count}</div>
            <div className="summary-desc">{card.description}</div>
          </button>
        );
      })}
    </div>
  );
};

