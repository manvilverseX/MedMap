import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { createCase, verifyAbha } from '../../utils/api';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useT } from '../../i18n/useT';
import { normalizeLanguage } from '../../utils/language';

const CONSENT_TRANSLATIONS: Record<string, {
  title: string;
  isDraft: boolean;
  collect: string;
  doctor: string;
  abdm: string;
  revocable: string;
}> = {
  English: {
    title: 'Granular Data Sharing Consent',
    isDraft: false,
    collect: 'I consent to MedMap collecting my health responses and medical documents to prepare my clinical history. Voice recordings and audio, when used, are processed securely by an AI service.',
    doctor: 'I consent to sharing my organized clinical history with treating physicians for medical consultation.',
    abdm: 'I consent to simulated ABDM care-context exchange (optional, mock mode).',
    revocable: 'You may revoke your consent or request your session data to be cleared at any time.'
  },
  Hindi: {
    title: 'डेटा साझाकरण सहमति (सटीक सहमति)',
    isDraft: true,
    collect: 'मैं मेदमैप द्वारा मेरा स्वास्थ्य इतिहास और दस्तावेज़ एकत्र करने की सहमति देता/देती हूँ। ध्वनि रिकॉर्डिंग और ऑडियो का उपयोग करने पर, उन्हें एक AI सेवा द्वारा सुरक्षित रूप से संसाधित किया जाता है।',
    doctor: 'मैं यह स्वास्थ्य जानकारी परामर्श हेतु डॉक्टर के साथ साझा करने की सहमति देता/देती हूँ।',
    abdm: 'मैं आयुष्मान भारत डिजिटल मिशन (ABDM) सिमुलेशन में भाग लेने की सहमति देता/देती हूँ (वैकल्पिक)।',
    revocable: 'आप किसी भी समय अपनी सहमति वापस ले सकते हैं या डिवाइस से डेटा मिटा सकते हैं।'
  },
  Kannada: {
    title: 'ಡೇಟಾ ಹಂಚಿಕೆ ಸಮ್ಮತಿ',
    isDraft: true,
    collect: 'ವೈದ್ಯಕೀಯ ಇತಿಹಾಸ ಸಿದ್ಧಪಡಿಸಲು ಮೆಡ್‌ಮ್ಯಾಪ್ ನನ್ನ ಆರೋಗ್ಯ ವಿವರಗಳನ್ನು ಸಂಗ್ರಹಿಸಲು ಸಮ್ಮತಿಸುತ್ತೇನೆ. ಧ್ವನಿ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳನ್ನು ಬಳಸಿದಾಗ, ಅವುಗಳನ್ನು AI ಸೇವೆಯ ಮೂಲಕ ಸುರಕ್ಷಿತವಾಗಿ ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತದೆ.',
    doctor: 'ಈ ಮಾಹಿತಿಯನ್ನು ಚಿಕಿತ್ಸೆ ನೀಡುವ ವೈದ್ಯರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲು ಸಮ್ಮತಿಸುತ್ತೇನೆ.',
    abdm: 'ಆಯುಷ್ಮಾನ್ ಭಾರತ್ ಡಿಜಿಟಲ್ ಮಿಷನ್ ಸಿಮ್ಯುಲೇಶನ್ ಡೇಟಾ ಹಂಚಿಕೆಗೆ ಸಮ್ಮತಿಸುತ್ತೇನೆ (ಐಚ್ಛಿಕ).',
    revocable: 'ನಿಮ್ಮ ಸಮ್ಮತಿಯನ್ನು ನೀವು ಯಾವುದೇ ಸಮಯದಲ್ಲಿ ಹಿಂಪಡೆಯಬಹುದು ಅಥವಾ ಡೇಟಾವನ್ನು ಅಳಿಸಬಹುದು.'
  }
};


export function PatientOnboardingPage() {
  const [patientId, setPatientId] = useState('');
  const [language, setLanguage] = useState('English');
  const { t } = useT(language);
  const [consultationType, setConsultationType] = useState('general');
  const [consentCollect, setConsentCollect] = useState(false);
  const [consentShareDoctor, setConsentShareDoctor] = useState(false);
  const [consentSimulateAbdm, setConsentSimulateAbdm] = useState(false);
  const hasConsent = consentCollect && consentShareDoctor;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normLang = normalizeLanguage(language);
  const consentKey = normLang === 'kn' ? 'Kannada' : normLang === 'hi' ? 'Hindi' : 'English';
  const consentCopy = CONSENT_TRANSLATIONS[consentKey] || CONSENT_TRANSLATIONS.English;

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
        <h2>{t('onboardingHeading') || 'Welcome to MedMap'}</h2>
        <p>{t('onboardingSubtitle') || 'Please enter your details to start.'}</p>
        
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
            <label htmlFor="patientId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('patientIdLabel') || 'Patient ID'}:
            </label>
            <input 
              id="patientId"
              type="text" 
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)}
              placeholder={t('patientIdPlaceholder') || 'e.g. p-12345'}
              required
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label htmlFor="language" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('languageLabel') || 'Preferred Language'}:
            </label>
            <select 
              id="language"
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="English">English</option>
              <option value="Hindi">हिंदी (Hindi)</option>
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>
          <div>
            <label htmlFor="consultationType" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('consultationTypeLabel') || 'Consultation Type'}:
            </label>
            <select
              id="consultationType"
              value={consultationType}
              onChange={(e) => setConsultationType(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="general">{t('consultationGeneral') || 'General Clinical History'}</option>
              <option value="ayush">{t('consultationAyush') || 'AYUSH / Ayurveda History'}</option>
            </select>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              {consultationType === 'ayush'
                ? (t('consultationAyushHint') || 'AYUSH includes general clinical history first, followed by Ayurvedic Dashavidha Pariksha questionnaire.')
                : (t('consultationGeneralHint') || 'Standard clinical history: symptoms, medications, allergies, and health background.')}
            </p>
          </div>
          {/* Granular & Revocable Patient Consent Section */}
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '1rem',
            backgroundColor: '#f8fafc',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-navy)' }}>
                {consentCopy.title}
              </span>
              {consentCopy.isDraft && (
                <span style={{ fontSize: '0.7rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #fde68a', fontWeight: 600 }}>
                  {t('draftTranslationTag') || 'Draft translation'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.86rem', color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={consentCollect}
                  onChange={(e) => setConsentCollect(e.target.checked)}
                  required
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>1. {t('consent1Label') || 'Data Collection:'}</strong> {consentCopy.collect}
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.86rem', color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={consentShareDoctor}
                  onChange={(e) => setConsentShareDoctor(e.target.checked)}
                  required
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>2. {t('consent2Label') || 'Doctor Sharing:'}</strong> {consentCopy.doctor}
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.86rem', color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={consentSimulateAbdm}
                  onChange={(e) => setConsentSimulateAbdm(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  <strong>3. {t('consent3Label') || 'ABDM Simulation (Optional):'}</strong> {consentCopy.abdm}
                </span>
              </label>
            </div>

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem', fontStyle: 'italic' }}>
              <strong>Revocability:</strong> {consentCopy.revocable}
            </p>
          </div>

          <Button
            type="submit" 
            isLoading={isLoading}
            disabled={isLoading || !hasConsent}
            style={{ width: '100%' }}
          >
            {isLoading ? (t('creatingCase') || 'Creating case...') : (t('startIntakeButton') || 'Start Intake')}
          </Button>
        </form>
      </main>
    </div>
  );
}
