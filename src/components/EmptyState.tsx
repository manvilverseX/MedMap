import React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  icon,
  className = '',
  style = {},
}) => {
  return (
    <div
      role="status"
      className={`medmap-empty-state ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '3rem 1.5rem',
        backgroundColor: 'var(--color-surface)',
        border: '2px dashed var(--color-navy)',
        borderRadius: '12px',
        margin: '1.5rem 0',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(15, 23, 42, 0.05)',
          color: 'var(--color-navy)',
          marginBottom: '1rem',
        }}
      >
        {icon || (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        )}
      </div>

      <h3
        style={{
          margin: 0,
          fontSize: '1.2rem',
          fontWeight: 700,
          color: 'var(--color-navy)',
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.95rem',
            color: 'var(--color-text-secondary)',
            maxWidth: '420px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {action && (
        <div style={{ marginTop: '1.25rem' }}>
          {action}
        </div>
      )}
    </div>
  );
};
