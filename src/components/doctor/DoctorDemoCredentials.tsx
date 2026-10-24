import React, { useState } from 'react';

interface DoctorDemoCredentialsProps {
  onQuickFill?: (credentials: { username: string; password: string }) => void;
}

export const LOCAL_DEMO_DOCTOR_USERNAME = 'demo_doctor';
export const LOCAL_DEMO_DOCTOR_PASSWORD = 'demo_doctor_password123';

export function getDemoDoctorCredentials(): { username: string; password: string } | null {
  const envUser = import.meta.env.VITE_DEMO_DOCTOR_USERNAME;
  const envPass = import.meta.env.VITE_DEMO_DOCTOR_PASSWORD;

  if (envUser && envPass) {
    return { username: envUser, password: envPass };
  }
  if (import.meta.env.DEV) {
    return { username: LOCAL_DEMO_DOCTOR_USERNAME, password: LOCAL_DEMO_DOCTOR_PASSWORD };
  }
  return null;
}

export const DoctorDemoCredentials: React.FC<DoctorDemoCredentialsProps> = ({ onQuickFill }) => {
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const creds = getDemoDoctorCredentials();
  if (!creds) {
    return null;
  }

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
    <section className="demo-credentials-box" aria-labelledby="demo-credentials-title">
      <div className="demo-credentials-header">
        <div className="demo-credentials-title-group">
          <svg
            className="demo-credentials-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3" />
          </svg>
          <h2 id="demo-credentials-title" className="demo-credentials-title">
            Demo Login Credentials
          </h2>
        </div>
        <span className="demo-credentials-badge">Demo</span>
      </div>

      <p className="demo-credentials-desc">
        For testing purposes, use the credentials below to access the Doctor Dashboard.
      </p>

      <div className="demo-credentials-grid">
        {/* Username Row */}
        <div className="demo-credential-item">
          <div className="demo-credential-meta">
            <span className="demo-credential-label">Username:</span>
            <button
              type="button"
              className="demo-credential-code"
              onClick={() => handleCopy(demoUsername, 'username')}
              title="Click to copy username"
              aria-label={`Copy username ${demoUsername}`}
            >
              {demoUsername}
            </button>
          </div>
          <button
            type="button"
            className={`demo-copy-btn ${copiedField === 'username' ? 'copied' : ''}`}
            onClick={() => handleCopy(demoUsername, 'username')}
            aria-label={`Copy username ${demoUsername}`}
          >
            {copiedField === 'username' ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>

        {/* Password Row */}
        <div className="demo-credential-item">
          <div className="demo-credential-meta">
            <span className="demo-credential-label">Password:</span>
            <button
              type="button"
              className="demo-credential-code"
              onClick={() => handleCopy(demoPassword, 'password')}
              title="Click to copy password"
              aria-label={`Copy password ${demoPassword}`}
            >
              {demoPassword}
            </button>
          </div>
          <button
            type="button"
            className={`demo-copy-btn ${copiedField === 'password' ? 'copied' : ''}`}
            onClick={() => handleCopy(demoPassword, 'password')}
            aria-label={`Copy password ${demoPassword}`}
          >
            {copiedField === 'password' ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {onQuickFill && (
        <button
          type="button"
          className="demo-fill-btn"
          onClick={() => onQuickFill({ username: demoUsername, password: demoPassword })}
          title="Fill form with demo credentials"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m13 2-2 7h5l-6 13 2-9H7z" />
          </svg>
          Fill Demo Credentials
        </button>
      )}
    </section>
  );
};
