import React from 'react';
import { useT } from '../i18n/useT';
import { MmIcon } from './ui';

export const ProblemStatementBadge: React.FC = () => {
  const { t } = useT();

  return (
    <aside
      className="mm-sih-badge"
      aria-label={t('sihBadgeLabel')}
      data-testid="problem-statement-badge"
    >
      <div className="mm-sih-badge-accent-strip" aria-hidden="true" />
      <div className="mm-sih-badge-body">
        <div className="mm-sih-badge-header">
          <MmIcon name="shield" size={13} className="mm-sih-badge-icon" />
          <span className="mm-sih-badge-label">{t('sihBadgeLabel')}</span>
        </div>
        <div className="mm-sih-badge-id">SIH26047</div>
        <div className="mm-sih-badge-detail">
          <div className="mm-sih-badge-title">Patient Case-Taking Software</div>
          <div className="mm-sih-badge-ministry">Ministry of Ayush</div>
        </div>
      </div>
    </aside>
  );
};
