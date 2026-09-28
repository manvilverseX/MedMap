import React from 'react';

interface LoadingIndicatorProps {
  message?: string;
  className?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Loading...',
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`loading-indicator ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        color: 'var(--color-navy)',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.95rem',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--color-navy)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="40 16"
          opacity="0.25"
        />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          stroke="var(--color-navy)"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
      {message && <span>{message}</span>}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {message}
      </span>
    </div>
  );
};
