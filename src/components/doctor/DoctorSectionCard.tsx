import React from 'react';

interface DoctorSectionCardProps {
  id?: string;
  title: string;
  tag?: string;
  children: React.ReactNode;
}

export const DoctorSectionCard: React.FC<DoctorSectionCardProps> = ({
  id,
  title,
  tag,
  children,
}) => {
  return (
    <section className="clinical-section-card" id={id} aria-label={title}>
      <div className="section-card-header">
        <h2 className="section-title">{title}</h2>
        {tag && <span className="section-tag">{tag}</span>}
      </div>
      <div className="section-card-content">{children}</div>
    </section>
  );
};

