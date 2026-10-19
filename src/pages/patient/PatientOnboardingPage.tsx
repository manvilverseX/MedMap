import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { createCase, verifyAbha } from '../../utils/api';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';

export function PatientOnboardingPage() {
  const [patientId, setPatientId] = useState('');
  const [language, setLanguage] = useState('English');
  const [consultationType, setConsultationType] = useState('general');
  const [hasConsent, setHasConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ABDM Simulation State
  const [hasAbha, setHasAbha] = useState(false);
  const [abhaId, setAbhaId] = useState('');
  const [abhaStep, setAbhaStep] = useState<'input' | 'otp' | 'verified'>('input');
  const [otpValue, setOtpValue] = useState('');
  const [isVerifyingAbha, setIsVerifyingAbha] = useState(false);
  const [abhaError, setAbhaError] = useState<string | null>(null);
  const [verifiedAbhaProfile, setVerifiedAbhaProfile] = useState<{ name: string; abhaId: string } | null>(null);

  const navigate = useNavigate();
  const { setCaseId } = useCase();

  useEffect(() => {
    // Clear any stale active case when starting a fresh onboarding session
    setCaseId(null);
  }, [setCaseId]);

  const handleVerifyAbha = async () => {
    if (!abhaId.trim()) {
      setAbhaError('Please enter an ABHA ID (e.g. 14-digit number or name@abdm)');
      return;
    }
    setAbhaError(null);
    setIsVerifyingAbha(true);
    try {
      const result = await verifyAbha(abhaId.trim());
      if (result.success) {
        setVerifiedAbhaProfile({
          name: result.data.name || 'Simulated Patient',
          abhaId: result.data.abhaId || abhaId.trim(),
        });
        setAbhaStep('otp');
      } else {
        setAbhaError('Verification returned negative result.');
      }
    } catch (err: any) {
      setAbhaError(err.message || 'Failed to verify ABHA ID. Check format.');
    } finally {
      setIsVerifyingAbha(false);
    }
  };

  const handleConfirmOtp = () => {
    if (!otpValue.trim()) {
      setAbhaError('Please enter the 6-digit OTP');
      return;
    }
    if (otpValue.trim() !== '123456') {
      setAbhaError('Invalid OTP for simulation. Please enter the demo OTP: 123456');
      return;
    }
    setAbhaError(null);
    setAbhaStep('verified');
    if (!patientId.trim() && verifiedAbhaProfile?.abhaId) {
      setPatientId(verifiedAbhaProfile.abhaId);
    }
  };

  const handleSkipAbha = () => {
    setHasAbha(false);
    setAbhaStep('input');
    setAbhaError(null);
    setOtpValue('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim() || !hasConsent) return;

    setIsLoading(true);
    setError(null);
    try {
      const verifiedAbhaToLink = (hasAbha && abhaStep === 'verified') ? (verifiedAbhaProfile?.abhaId || abhaId.trim()) : undefined;
      const newCase = await createCase(patientId, language, hasConsent, consultationType, verifiedAbhaToLink);
      setCaseId(newCase.caseId);
      navigate('/patient/intake');
    } catch (err) {
      setError('Failed to create case. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <div className="logo">Patient Onboarding</div>
      </header>
      <main style={{ marginTop: '2rem', maxWidth: '480px' }}>
        <h2>Welcome to MedMap</h2>
        <p>Please enter your details to start.</p>
        
        <ErrorMessage message={error} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Optional ABHA ID Verification Card */}
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: 'var(--color-background-alt)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>
                <input
                  type="checkbox"
                  id="toggle-has-abha"
                  checked={hasAbha}
                  onChange={(e) => {
                    setHasAbha(e.target.checked);
                    if (!e.target.checked) handleSkipAbha();
                  }}
                />
                Have an ABHA ID?
              </label>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                backgroundColor: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
              }}>
                Simulation: not connected to ABDM
              </span>
            </div>

            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Link your Ayushman Bharat Health Account to simulate ABDM longitudinal health record integration.
            </p>

            {hasAbha && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                {abhaError && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '0.82rem' }}>
                    {abhaError}
                  </div>
                )}

                {abhaStep === 'input' && (
                  <div>
                    <label htmlFor="input-abha-id" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      ABHA ID / Address:
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        id="input-abha-id"
                        type="text"
                        value={abhaId}
                        onChange={(e) => setAbhaId(e.target.value)}
                        placeholder="e.g. 14-digit ABHA or user@abdm"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                      />
                      <Button
                        type="button"
                        onClick={handleVerifyAbha}
                        isLoading={isVerifyingAbha}
                        disabled={isVerifyingAbha || !abhaId.trim()}
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                      >
                        Verify
                      </Button>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={handleSkipAbha}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Skip ABHA / Continue without
                      </button>
                    </div>
                  </div>
                )}

                {abhaStep === 'otp' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label htmlFor="input-abha-otp" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        Enter 6-digit OTP:
                      </label>
                      <span style={{ fontSize: '0.72rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 600 }}>
                        Demo hint: 123456
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      Simulated verification code sent to mobile linked with ABHA {verifiedAbhaProfile?.abhaId}.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        id="input-abha-otp"
                        type="text"
                        maxLength={6}
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value)}
                        placeholder="123456"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem', letterSpacing: '0.15em', textAlign: 'center' }}
                      />
                      <Button
                        type="button"
                        onClick={handleConfirmOtp}
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem', backgroundColor: 'var(--color-verify)', borderColor: 'var(--color-verify)' }}
                      >
                        Confirm OTP
                      </Button>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setAbhaStep('input')}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        ← Re-enter ABHA ID
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipAbha}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Skip for now
                      </button>
                    </div>
                  </div>
                )}

                {abhaStep === 'verified' && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#166534', fontSize: '0.85rem' }}>✓ ABHA Verified (Simulation)</strong>
                      <span style={{ fontSize: '0.72rem', color: '#166534', backgroundColor: '#dcfce7', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        Linked
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '0.25rem' }}>
                      {verifiedAbhaProfile?.name} • ID: {verifiedAbhaProfile?.abhaId}
                    </div>
                    <button
                      type="button"
                      onClick={handleSkipAbha}
                      style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: '#166534', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Change / Disconnect ABHA
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="patientId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Patient ID:</label>
            <input 
              id="patientId"
              type="text" 
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="e.g. p-12345"
              required
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label htmlFor="language" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Preferred Language:</label>
            <select 
              id="language"
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Kannada">Kannada</option>
            </select>
          </div>
          <div>
            <label htmlFor="consultationType" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Consultation Type:</label>
            <select
              id="consultationType"
              value={consultationType}
              onChange={(e) => setConsultationType(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="general">General Clinical History</option>
              <option value="ayush">AYUSH / Ayurveda History</option>
            </select>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              {consultationType === 'ayush'
                ? 'AYUSH includes general clinical history first, followed by Ayurvedic Dashavidha Pariksha questionnaire.'
                : 'Standard clinical history: symptoms, medications, allergies, and health background.'}
            </p>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={hasConsent}
                onChange={(e) => setHasConsent(e.target.checked)}
                required
                style={{ marginTop: '0.25rem' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                I understand that MedMap will collect my health information during this intake process to prepare my case for clinical consultation. I agree to proceed.
              </span>
            </label>
          </div>
          <Button
            type="submit" 
            isLoading={isLoading}
            disabled={isLoading || !hasConsent}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Creating case...' : 'Start Intake'}
          </Button>
        </form>
      </main>
    </div>
  );
}
