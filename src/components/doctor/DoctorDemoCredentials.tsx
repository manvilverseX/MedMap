import React, { useState } from 'react';
import { useT } from '../../i18n/useT';
import { MmCard, MmButton, MmIcon } from '../ui';

export const DEFAULT_DEMO_DOCTOR_USERNAME = 'doctor';
export const DEFAULT_DEMO_DOCTOR_PASSWORD = 'doctor';

export const LOCAL_DEMO_DOCTOR_USERNAME = DEFAULT_DEMO_DOCTOR_USERNAME;
export const LOCAL_DEMO_DOCTOR_PASSWORD = DEFAULT_DEMO_DOCTOR_PASSWORD;

export function getDemoDoctorCredentials(): { username: string; password: string } {
  const envUser = import.meta.env.VITE_DEMO_DOCTOR_USERNAME;
  const envPass = import.meta.env.VITE_DEMO_DOCTOR_PASSWORD;

  return {
    username: envUser || DEFAULT_DEMO_DOCTOR_USERNAME,
    password: envPass || DEFAULT_DEMO_DOCTOR_PASSWORD,
  };
}

interface DoctorDemoCredentialsProps {
  onQuickFill?: (credentials: { username: string; password: string }) => void;
}

export const DoctorDemoCredentials: React.FC<DoctorDemoCredentialsProps> = ({ onQuickFill }) => {
  const { t } = useT();
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const creds = getDemoDoctorCredentials();
  const demoUsername = creds.username;
  const demoPassword = creds.password;

  const handleCopy = async (text: string, field: 'username' | 'password') => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.warn('Unable to copy text: ', err);
    }
  };

  return (
    <MmCard
      variant="default"
      data-testid="doctor-demo-credentials-card"
      className="card mm-card mm-doctor-demo-credentials-card"
      style={{
        backgroundColor: 'var(--mm-paper-deep)',
        border: '1.5px solid var(--mm-ink)',
        borderRadius: 'var(--mm-radius-md)',
        boxShadow: '2.5px 2.5px 0 var(--mm-ink)',
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MmIcon name="shield" size={18} style={{ color: 'var(--mm-teal-dark)' }} />
          <h2
            id="doctor-demo-credentials-title"
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 800,
              color: 'var(--mm-ink)',
              letterSpacing: '0.2px',
            }}
          >
            {t('doctorDemoTitle')}
          </h2>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            backgroundColor: 'var(--mm-teal-pale)',
            color: 'var(--mm-teal-dark)',
            padding: '0.2rem 0.55rem',
            borderRadius: '999px',
            border: '1px solid var(--mm-teal-dark)',
          }}
        >
          {t('doctorDemoBadge')}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          backgroundColor: 'var(--mm-white)',
          border: '1px solid var(--mm-line, rgba(8, 45, 73, 0.2))',
          borderRadius: 'var(--mm-radius-sm)',
          padding: '0.75rem 0.85rem',
          marginBottom: '0.85rem',
        }}
      >
        {/* Username */}
        <div>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--mm-ink-soft)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('doctorDemoUsernameLabel')}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.35rem',
              marginTop: '0.2rem',
            }}
          >
            <code
              style={{
                fontFamily: 'var(--mm-font-mono, monospace)',
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--mm-ink)',
              }}
            >
              {demoUsername}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(demoUsername, 'username')}
              title={copiedField === 'username' ? t('doctorDemoCopied') : t('doctorDemoCopy')}
              aria-label={`${t('doctorDemoCopy')} ${t('doctorDemoUsernameLabel')}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: copiedField === 'username' ? 'var(--mm-teal-dark)' : 'var(--mm-ink-soft)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <MmIcon name={copiedField === 'username' ? 'check' : 'file'} size={14} />
            </button>
          </div>
        </div>

        {/* Password */}
        <div>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--mm-ink-soft)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {t('doctorDemoPasswordLabel')}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.35rem',
              marginTop: '0.2rem',
            }}
          >
            <code
              style={{
                fontFamily: 'var(--mm-font-mono, monospace)',
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--mm-ink)',
              }}
            >
              {demoPassword}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(demoPassword, 'password')}
              title={copiedField === 'password' ? t('doctorDemoCopied') : t('doctorDemoCopy')}
              aria-label={`${t('doctorDemoCopy')} ${t('doctorDemoPasswordLabel')}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: copiedField === 'password' ? 'var(--mm-teal-dark)' : 'var(--mm-ink-soft)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <MmIcon name={copiedField === 'password' ? 'check' : 'file'} size={14} />
            </button>
          </div>
        </div>
      </div>

      {onQuickFill && (
        <MmButton
          type="button"
          variant="secondary"
          size="sm"
          data-testid="doctor-autofill-btn"
          icon="check"
          onClick={() => onQuickFill({ username: demoUsername, password: demoPassword })}
          style={{ width: '100%', fontWeight: 700 }}
        >
          {t('doctorDemoAutofill')}
        </MmButton>
      )}
    </MmCard>
  );
};
