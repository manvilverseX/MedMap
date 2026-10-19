import { useState, useEffect, useCallback } from 'react';

interface InactivityCountdownBannerProps {
  timeoutSeconds?: number;
  warningThresholdSeconds?: number;
  onClearDevice: () => void;
}

export function InactivityCountdownBanner({
  timeoutSeconds = 300, // 5 minutes
  warningThresholdSeconds = 60, // 1 minute warning
  onClearDevice,
}: InactivityCountdownBannerProps) {
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
        backgroundColor: '#7f1d1d',
        color: '#fff',
        padding: '1rem 1.25rem',
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.35)',
        zIndex: 9999,
        border: '2px solid #ef4444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
          <span>⏱️</span>
          <span>Shared Device Inactivity Warning ({timeFormatted})</span>
        </div>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#fecaca', lineHeight: 1.4 }}>
          To protect your medical privacy on shared kiosks, this session will reset and clear all data.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          type="button"
          onClick={resetTimer}
          style={{
            padding: '0.4rem 0.8rem',
            backgroundColor: '#fff',
            color: '#7f1d1d',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Keep Working
        </button>
        <button
          type="button"
          onClick={onClearDevice}
          style={{
            padding: '0.4rem 0.8rem',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Clear Device Now
        </button>
      </div>
    </div>
  );
}
