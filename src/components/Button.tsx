import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'outline' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  className = '',
  style = {},
  ...rest
}) => {
  const isDisabled = disabled || isLoading;

  const variantStyles: Record<'primary' | 'success' | 'outline' | 'danger', React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-navy)',
      color: 'var(--color-surface)',
      border: '2px solid var(--color-navy)',
    },
    success: {
      backgroundColor: 'var(--color-verify)',
      color: 'var(--color-navy)',
      border: '2px solid var(--color-navy)',
    },
    outline: {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-navy)',
      border: '2px solid var(--color-navy)',
    },
    danger: {
      backgroundColor: '#ef4444',
      color: 'var(--color-surface)',
      border: '2px solid var(--color-navy)',
    },
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.65rem 1.25rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '8px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.65 : 1,
    boxShadow: isDisabled ? 'none' : '3px 3px 0px var(--color-navy)',
    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
    ...variantStyles[variant],
    ...style,
  };

  return (
    <button
      disabled={isDisabled}
      aria-busy={isLoading}
      className={`medmap-btn ${className}`.trim()}
      style={baseStyle}
      {...rest}
    >
      {children}
    </button>
  );
};
