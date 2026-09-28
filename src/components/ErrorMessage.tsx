import React from 'react';

export interface ErrorMessageProps {
  message?: string | null;
  className?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  className = '',
  onDismiss,
  onRetry,
}) => {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`error-message ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.65rem 0.85rem',
        marginBottom: '1rem',
        backgroundColor: '#fef2f2',
        border: '1.5px solid #ef4444',
        borderRadius: '6px',
        color: '#b91c1c',
        fontSize: '0.9rem',
        fontFamily: 'var(--font-sans)',
        lineHeight: 1.4,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: '2px' }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span>{message}</span>
        {onRetry && (
          <div style={{ marginTop: '0.4rem' }}>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry action"
              style={{
                padding: '0.2rem 0.55rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                color: '#b91c1c',
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          style={{
            background: 'none',
            border: 'none',
            padding: '2px',
            color: '#b91c1c',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
};
