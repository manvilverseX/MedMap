import React from 'react';
import type { CaseFilter, CaseCounts } from './DoctorCaseSummary';

interface DoctorCaseFiltersProps {
  activeFilter: CaseFilter;
  onFilterChange: (filter: CaseFilter) => void;
  counts: CaseCounts;
}

export const DoctorCaseFilters: React.FC<DoctorCaseFiltersProps> = ({
  activeFilter,
  onFilterChange,
  counts,
}) => {
  const filterOptions: Array<{ id: CaseFilter; label: string; count: number }> = [
    { id: 'all', label: 'All Cases', count: counts.total },
    { id: 'doctor_review', label: 'Doctor Review', count: counts.doctorReview },
    { id: 'in_progress', label: 'In Progress', count: counts.inProgress },
    { id: 'completed', label: 'Completed', count: counts.completed },
  ];

  return (
    <nav className="doctor-filter-bar" aria-label="Filter cases by status">
      <span className="filter-label">Filter by Status:</span>
      <div className="filter-buttons" role="tablist">
        {filterOptions.map((opt) => {
          const isActive = activeFilter === opt.id;
          return (
            <button
              key={opt.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              className={`filter-tab ${isActive ? 'active' : ''}`}
              onClick={() => onFilterChange(opt.id)}
            >
              <span>{opt.label}</span>
              <span className="filter-pill-count">{opt.count}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

