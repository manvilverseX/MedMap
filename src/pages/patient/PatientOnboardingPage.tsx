import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { createCase, verifyAbha, mapApiErrorToKey } from '../../utils/api';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useT } from '../../i18n/useT';
import { normalizeLanguage, setSessionLanguage, getSessionLanguage } from '../../utils/language';
import { getDemoDoctorCredentials } from '../../components/doctor/DoctorDemoCredentials';

export function PatientOnboardingPage() {
  const [patientId, setPatientId] = useState('');
  const [language, setLanguage] = useState(() => {
    const norm = getSessionLanguage();
    return norm === 'kn' ? 'Kannada' : norm === 'hi' ? 'Hindi' : 'English';
  });
  const { t } = useT(language);
  const [consultationType, setConsultationType] = useState('general');
  const [consentCollect, setConsentCollect] = useState(false);
  const [consentShareDoctor, setConsentShareDoctor] = useState(false);
  const [consentSimulateAbdm, setConsentSimulateAbdm] = useState(false);
  const hasConsent = consentCollect && consentShareDoctor;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normLang = normalizeLanguage(language);
  const isDraftConsent = normLang !== 'en';

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

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setSessionLanguage(newLang);
  };

  const handleVerifyAbha = async () => {
    if (!abhaId.trim()) {
      setAbhaError(t('abhaEnterError'));
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
        setAbhaError(t('abhaNegativeError'));
      }
    } catch (err: any) {
      setAbhaError(err.message || t('abhaFailedVerifyError'));
    } finally {
      setIsVerifyingAbha(false);
    }
  };

  const handleConfirmOtp = () => {
    if (!otpValue.trim()) {
      setAbhaError(t('abhaEnterOtpError'));
      return;
    }
    if (otpValue.trim() !== '123456') {
      setAbhaError(t('abhaInvalidOtpError'));
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
    } catch (err: any) {
      setError(t(mapApiErrorToKey(err) || 'abhaCreateCaseError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <div className="logo">{t('onboardingLogo')}</div>
      </header>
      <main style={{ marginTop: '2rem', maxWidth: '480px' }}>
        <h2>{t('onboardingHeading')}</h2>
        <p>{t('onboardingSubtitle')}</p>
        
        {Boolean(getDemoDoctorCredentials()) && (
          <div
            role="note"
            style={{
              backgroundColor: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              padding: '0.45rem 0.75rem',
              fontSize: '0.82rem',
              fontWeight: 500,
              marginBottom: '1rem',
              textAlign: 'center',
            }}
          >
            {t('demoSyntheticDataBanner')}
          </div>
        )}

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
                {t('abhaToggleLabel')}
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
                {t('abhaSimBadge')}
              </span>
            </div>

            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              {t('abhaDescription')}
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
                      {t('abhaIdLabel')}
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        id="input-abha-id"
                        type="text"
                        value={abhaId}
                        onChange={(e) => setAbhaId(e.target.value)}
                        placeholder={t('abhaIdPlaceholder')}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                      />
                      <Button
                        type="button"
                        onClick={handleVerifyAbha}
                        isLoading={isVerifyingAbha}
                        disabled={isVerifyingAbha || !abhaId.trim()}
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                      >
                        {t('abhaVerifyButton')}
                      </Button>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={handleSkipAbha}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {t('abhaSkipButton')}
                      </button>
                    </div>
                  </div>
                )}

                {abhaStep === 'otp' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label htmlFor="input-abha-otp" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {t('abhaOtpLabel')}
                      </label>
                      <span style={{ fontSize: '0.72rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 600 }}>
                        {t('abhaOtpHint')}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      {t('abhaOtpNotice', { id: verifiedAbhaProfile?.abhaId || '' })}
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
                        {t('abhaConfirmOtp')}
                      </Button>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setAbhaStep('input')}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {t('abhaReEnter')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipAbha}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {t('abhaSkipNow')}
                      </button>
                    </div>
                  </div>
                )}

                {abhaStep === 'verified' && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.65rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#166534', fontSize: '0.85rem' }}>{t('abhaVerified')}</strong>
                      <span style={{ fontSize: '0.72rem', color: '#166534', backgroundColor: '#dcfce7', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        {t('abhaLinked')}
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
                      {t('abhaChange')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="patientId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('patientIdLabel')}:
            </label>
            <input 
              id="patientId"
              type="text" 
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)}
              placeholder={t('patientIdPlaceholder')}
              required
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label htmlFor="language" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('languageLabel')}:
            </label>
            <select 
              id="language"
              value={language} 
              onChange={(e) => handleLanguageChange(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="English">{t('languageEnglish')}</option>
              <option value="Hindi">{t('languageHindi')}</option>
              <option value="Kannada">{t('languageKannada')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="consultationType" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              {t('consultationTypeLabel')}:
            </label>
            <select
              id="consultationType"
              value={consultationType}
              onChange={(e) => setConsultationType(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            >
              <option value="general">{t('consultationGeneral')}</option>
              <option value="ayush">{t('consultationAyush')}</option>
            </select>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              {consultationType === 'ayush'
                ? t('consultationAyushHint')
                : t('consultationGeneralHint')}
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
                {t('consentTitle')}
              </span>
              {isDraftConsent && (
                <span style={{ fontSize: '0.7rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #fde68a', fontWeight: 600 }}>
                  {t('draftTranslationTag')}
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
                  <strong>1. {t('consent1Label')}</strong> {t('consent1Text')}
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
                  <strong>2. {t('consent2Label')}</strong> {t('consent2Text')}
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
                  <strong>3. {t('consent3Label')}</strong> {t('consent3Text')}
                </span>
              </label>
            </div>

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem', fontStyle: 'italic' }}>
              <strong>{t('consentRevocability')}</strong> {t('consentRevocable')}
            </p>
          </div>

          <Button
            type="submit" 
            isLoading={isLoading}
            disabled={isLoading || !hasConsent}
            style={{ width: '100%' }}
          >
            {isLoading ? t('creatingCase') : t('startIntakeButton')}
          </Button>
        </form>
      </main>
    </div>
  );
}
