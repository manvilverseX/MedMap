import { useState, useEffect, useCallback } from 'react';
import { useT } from '../../i18n/useT';

interface InactivityCountdownBannerProps {
  timeoutSeconds?: number;
  warningThresholdSeconds?: number;
  onClearDevice: () => void;
  lang?: string | null;
}

export function InactivityCountdownBanner({
  timeoutSeconds = 300, // 5 minutes
  warningThresholdSeconds = 60, // 1 minute warning
  onClearDevice,
  lang,
}: InactivityCountdownBannerProps) {
  const { t } = useT(lang);
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);

  const resetTimer = useCallback(() => {
    setSecondsLeft(timeoutSeconds);
  }, [timeoutSeconds]);

  useEffect(() => {
    const handleActivity = () => {
      // Only reset automatically if not already in the final 60s warning window
      setSecondsLeft((current) => {
        if (current <= warningThresholdSeconds) {
          return current; // Don't silently auto-reset once warning dialog is shown
        }
        return timeoutSeconds;
      });
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClearDevice();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [timeoutSeconds, warningThresholdSeconds, onClearDevice]);

  if (secondsLeft > warningThresholdSeconds) {
    return null;
  }

  const minutes = Math.floor(secondsLeft / 60);
  const remainingSecs = secondsLeft % 60;
  const timeFormatted = `${minutes}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '560px',
        backgroundColor: 'var(--mm-paper, #fdfbf7)',
        color: 'var(--mm-ink, #082d49)',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--mm-radius-md, 12px)',
        boxShadow: '4px 4px 0px var(--mm-ink, #082d49)',
        zIndex: 9999,
        border: '2px solid var(--mm-coral, #d94e34)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem',
      }}
    >
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, fontSize: '0.98rem', color: 'var(--mm-ink, #082d49)' }}>
          <span aria-hidden="true">⏱️</span>
          <span>{t('inactivityWarning', { time: timeFormatted })}</span>
        </div>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--mm-ink-soft, #33536b)', lineHeight: 1.45 }}>
          {t('inactivityDescription')}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          type="button"
          onClick={resetTimer}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--mm-teal, #007787)',
            color: '#ffffff',
            border: '1.5px solid var(--mm-ink, #082d49)',
            borderRadius: 'var(--mm-radius-sm, 6px)',
            boxShadow: '2px 2px 0px var(--mm-ink, #082d49)',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t('inactivityStay')}
        </button>
        <button
          type="button"
          onClick={onClearDevice}
          style={{
            minHeight: '44px',
            minWidth: '44px',
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--mm-coral-pale, #fff1ee)',
            color: 'var(--mm-coral, #d94e34)',
            border: '1.5px solid var(--mm-ink, #082d49)',
            borderRadius: 'var(--mm-radius-sm, 6px)',
            boxShadow: '2px 2px 0px var(--mm-ink, #082d49)',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t('inactivityClear')}
        </button>
      </div>
    </div>
  );
}
