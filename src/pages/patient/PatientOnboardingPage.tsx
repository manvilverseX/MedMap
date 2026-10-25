import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { createCase, verifyAbha, mapApiErrorToKey } from '../../utils/api';
import { Button } from '../../components/Button';
import { MmCard, MmButton, MmIcon } from '../../components/ui';
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
    <div className="container mm-patient-onboarding-container" style={{ maxWidth: '580px', margin: '2rem auto', padding: '1rem' }}>
      <header className="mm-patient-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'var(--mm-teal)',
                color: 'var(--mm-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.2rem',
                border: '1.5px solid var(--mm-ink)',
                boxShadow: '1.5px 1.5px 0 var(--mm-ink)',
              }}
              aria-hidden="true"
            >
              +
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--mm-ink)', letterSpacing: '-0.02em' }}>
              MedMap
            </span>
            <span className="mm-badge mm-badge--neutral" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('onboardingLogo')}
            </span>
          </div>

          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--mm-ink)',
              textDecoration: 'none',
            }}
          >
            <MmIcon name="arrow" size={14} style={{ transform: 'rotate(180deg)' }} />
            {t('documentsNavHome')}
          </a>
        </div>
      </header>

      <main>
        <MmCard variant="elevated" className="mm-onboarding-card" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
            <h1
              style={{
                margin: '0 0 0.4rem',
                fontSize: '1.85rem',
                fontWeight: 800,
                color: 'var(--mm-ink)',
                lineHeight: 1.25,
              }}
            >
              {t('onboardingHeading')}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '0.92rem',
                color: 'var(--mm-ink-soft)',
                lineHeight: 1.5,
              }}
            >
              {t('onboardingSubtitle')}
            </p>
          </div>

          {Boolean(getDemoDoctorCredentials()) && (
            <div
              role="note"
              style={{
                backgroundColor: 'var(--mm-coral-pale)',
                color: '#8a2c11',
                border: '1.5px solid var(--mm-coral)',
                borderRadius: 'var(--mm-radius-sm)',
                padding: '0.55rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                marginBottom: '1.25rem',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              {t('demoSyntheticDataBanner')}
            </div>
          )}

          <ErrorMessage message={error} />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
            {/* Preferred Language Selection (Large Friendly Cards) */}
            <div>
              <label
                htmlFor="language"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--mm-ink)',
                }}
              >
                {t('languageLabel')}:
              </label>

              {/* Large touch-friendly language cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.6rem',
                  marginBottom: '0.5rem',
                }}
              >
                {[
                  { id: 'English', label: t('languageEnglish') },
                  { id: 'Hindi', label: t('languageHindi') },
                  { id: 'Kannada', label: t('languageKannada') },
                ].map((langItem) => {
                  const isSelected = language === langItem.id;
                  return (
                    <button
                      key={langItem.id}
                      type="button"
                      onClick={() => handleLanguageChange(langItem.id)}
                      style={{
                        padding: '0.75rem 0.5rem',
                        minHeight: '56px',
                        borderRadius: 'var(--mm-radius-md)',
                        border: isSelected ? '2px solid var(--mm-teal)' : '1.5px solid var(--mm-ink)',
                        backgroundColor: isSelected ? 'var(--mm-teal-pale)' : 'var(--mm-white)',
                        color: isSelected ? 'var(--mm-teal-dark)' : 'var(--mm-ink)',
                        boxShadow: isSelected ? '2px 2px 0 var(--mm-teal)' : '2px 2px 0 var(--mm-ink)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <strong style={{ fontSize: '0.95rem', fontWeight: 700 }}>{langItem.label}</strong>
                    </button>
                  );
                })}
              </div>

              {/* Keep underlying select element synced for tests and accessibility */}
              <select
                id="language"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--mm-radius-sm)',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  backgroundColor: '#f8fafc',
                  color: 'var(--mm-ink-soft)',
                }}
              >
                <option value="English">{t('languageEnglish')}</option>
                <option value="Hindi">{t('languageHindi')}</option>
                <option value="Kannada">{t('languageKannada')}</option>
              </select>
            </div>

            {/* Patient ID Input */}
            <div>
              <label
                htmlFor="patientId"
                style={{
                  display: 'block',
                  marginBottom: '0.45rem',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--mm-ink)',
                }}
              >
                {t('patientIdLabel')}:
              </label>
              <input
                id="patientId"
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder={t('patientIdPlaceholder')}
                required
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0.65rem 0.9rem',
                  borderRadius: 'var(--mm-radius-md)',
                  border: '1.5px solid var(--mm-ink)',
                  backgroundColor: 'var(--mm-white)',
                  color: 'var(--mm-ink)',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  boxShadow: 'inset 0 1px 2px rgba(8, 45, 73, 0.05)',
                }}
              />
            </div>

            {/* Consultation Type Selection */}
            <div>
              <label
                htmlFor="consultationType"
                style={{
                  display: 'block',
                  marginBottom: '0.45rem',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--mm-ink)',
                }}
              >
                {t('consultationTypeLabel')}:
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.45rem' }}>
                <button
                  type="button"
                  onClick={() => setConsultationType('general')}
                  style={{
                    padding: '0.65rem 0.75rem',
                    minHeight: '52px',
                    borderRadius: 'var(--mm-radius-md)',
                    border: consultationType === 'general' ? '2px solid var(--mm-teal)' : '1.5px solid var(--mm-ink)',
                    backgroundColor: consultationType === 'general' ? 'var(--mm-teal-pale)' : 'var(--mm-white)',
                    color: consultationType === 'general' ? 'var(--mm-teal-dark)' : 'var(--mm-ink)',
                    boxShadow: consultationType === 'general' ? '2px 2px 0 var(--mm-teal)' : '2px 2px 0 var(--mm-ink)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <strong style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                    {t('consultationGeneral')}
                  </strong>
                </button>

                <button
                  type="button"
                  onClick={() => setConsultationType('ayush')}
                  style={{
                    padding: '0.65rem 0.75rem',
                    minHeight: '52px',
                    borderRadius: 'var(--mm-radius-md)',
                    border: consultationType === 'ayush' ? '2px solid var(--mm-teal)' : '1.5px solid var(--mm-ink)',
                    backgroundColor: consultationType === 'ayush' ? 'var(--mm-teal-pale)' : 'var(--mm-white)',
                    color: consultationType === 'ayush' ? 'var(--mm-teal-dark)' : 'var(--mm-ink)',
                    boxShadow: consultationType === 'ayush' ? '2px 2px 0 var(--mm-teal)' : '2px 2px 0 var(--mm-ink)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <strong style={{ fontSize: '0.92rem', fontWeight: 700 }}>
                    {t('consultationAyush')}
                  </strong>
                </button>
              </div>

              <select
                id="consultationType"
                value={consultationType}
                onChange={(e) => setConsultationType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--mm-radius-sm)',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  backgroundColor: '#f8fafc',
                  color: 'var(--mm-ink-soft)',
                }}
              >
                <option value="general">{t('consultationGeneral')}</option>
                <option value="ayush">{t('consultationAyush')}</option>
              </select>
              <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.78rem', color: 'var(--mm-ink-soft)', lineHeight: 1.4 }}>
                {consultationType === 'ayush' ? t('consultationAyushHint') : t('consultationGeneralHint')}
              </p>
            </div>

            {/* Optional ABHA ID Verification Card */}
            <div
              style={{
                border: '1.5px solid var(--mm-ink)',
                borderRadius: 'var(--mm-radius-md)',
                padding: '1.1rem',
                backgroundColor: 'var(--mm-paper)',
                boxShadow: '2px 2px 0 var(--mm-ink)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.92rem', color: 'var(--mm-ink)' }}>
                  <input
                    type="checkbox"
                    id="toggle-has-abha"
                    checked={hasAbha}
                    onChange={(e) => {
                      setHasAbha(e.target.checked);
                      if (!e.target.checked) handleSkipAbha();
                    }}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--mm-teal)', cursor: 'pointer' }}
                  />
                  {t('abhaToggleLabel')}
                </label>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--mm-coral-pale)',
                    color: '#8a2c11',
                    border: '1px solid var(--mm-coral)',
                  }}
                >
                  {t('abhaSimBadge')}
                </span>
              </div>

              <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--mm-ink-soft)', lineHeight: 1.45 }}>
                {t('abhaDescription')}
              </p>

              {hasAbha && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
                  {abhaError && (
                    <div
                      style={{
                        marginBottom: '0.75rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--mm-radius-sm)',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        border: '1px solid #fca5a5',
                      }}
                    >
                      {abhaError}
                    </div>
                  )}

                  {abhaStep === 'input' && (
                    <div>
                      <label htmlFor="input-abha-id" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--mm-ink)' }}>
                        {t('abhaIdLabel')}
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          id="input-abha-id"
                          type="text"
                          value={abhaId}
                          onChange={(e) => setAbhaId(e.target.value)}
                          placeholder={t('abhaIdPlaceholder')}
                          style={{
                            flex: 1,
                            minHeight: '44px',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--mm-radius-sm)',
                            border: '1.5px solid var(--mm-ink)',
                            fontSize: '0.88rem',
                            color: 'var(--mm-ink)',
                          }}
                        />
                        <Button
                          type="button"
                          onClick={handleVerifyAbha}
                          isLoading={isVerifyingAbha}
                          disabled={isVerifyingAbha || !abhaId.trim()}
                          style={{ fontSize: '0.85rem', padding: '0.5rem 0.95rem' }}
                        >
                          {t('abhaVerifyButton')}
                        </Button>
                      </div>
                      <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleSkipAbha}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--mm-ink-soft)',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontWeight: 600,
                          }}
                        >
                          {t('abhaSkipButton')}
                        </button>
                      </div>
                    </div>
                  )}

                  {abhaStep === 'otp' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <label htmlFor="input-abha-otp" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--mm-ink)' }}>
                          {t('abhaOtpLabel')}
                        </label>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            backgroundColor: '#e0f2fe',
                            color: '#0369a1',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            border: '1px solid #bae6fd',
                            fontWeight: 700,
                          }}
                        >
                          {t('abhaOtpHint')}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--mm-ink-soft)' }}>
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
                          style={{
                            flex: 1,
                            minHeight: '44px',
                            padding: '0.5rem',
                            borderRadius: 'var(--mm-radius-sm)',
                            border: '1.5px solid var(--mm-ink)',
                            fontSize: '1rem',
                            letterSpacing: '0.2em',
                            textAlign: 'center',
                            fontWeight: 700,
                          }}
                        />
                        <Button
                          type="button"
                          onClick={handleConfirmOtp}
                          style={{ fontSize: '0.85rem', padding: '0.5rem 0.95rem' }}
                        >
                          {t('abhaConfirmOtp')}
                        </Button>
                      </div>
                      <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setAbhaStep('input')}
                          style={{ background: 'none', border: 'none', color: 'var(--mm-ink-soft)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {t('abhaReEnter')}
                        </button>
                        <button
                          type="button"
                          onClick={handleSkipAbha}
                          style={{ background: 'none', border: 'none', color: 'var(--mm-ink-soft)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {t('abhaSkipNow')}
                        </button>
                      </div>
                    </div>
                  )}

                  {abhaStep === 'verified' && (
                    <div style={{ backgroundColor: 'var(--mm-teal-pale)', border: '1.5px solid var(--mm-teal)', borderRadius: 'var(--mm-radius-sm)', padding: '0.75rem 0.95rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: 'var(--mm-teal-dark)', fontSize: '0.88rem' }}>{t('abhaVerified')}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--mm-teal-dark)', backgroundColor: '#dcfce7', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                          {t('abhaLinked')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--mm-ink)', marginTop: '0.3rem', fontWeight: 600 }}>
                        {verifiedAbhaProfile?.name} • ID: {verifiedAbhaProfile?.abhaId}
                      </div>
                      <button
                        type="button"
                        onClick={handleSkipAbha}
                        style={{ marginTop: '0.45rem', background: 'none', border: 'none', color: 'var(--mm-teal-dark)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontWeight: 700 }}
                      >
                        {t('abhaChange')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Granular & Revocable Patient Consent Section */}
            <div
              style={{
                border: '1.5px solid var(--mm-ink)',
                borderRadius: 'var(--mm-radius-md)',
                padding: '1.15rem',
                backgroundColor: 'var(--mm-paper)',
                boxShadow: '2px 2px 0 var(--mm-ink)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--mm-ink)' }}>
                  {t('consentTitle')}
                </span>
                {isDraftConsent && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      backgroundColor: 'var(--mm-coral-pale)',
                      color: '#8a2c11',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      border: '1px solid var(--mm-coral)',
                      fontWeight: 700,
                    }}
                  >
                    {t('draftTranslationTag')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label
                  htmlFor="consent-collect"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    fontSize: '0.86rem',
                    color: 'var(--mm-ink)',
                    backgroundColor: consentCollect ? 'var(--mm-teal-pale)' : 'transparent',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    border: consentCollect ? '1px solid var(--mm-teal)' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    id="consent-collect"
                    type="checkbox"
                    checked={consentCollect}
                    onChange={(e) => setConsentCollect(e.target.checked)}
                    required
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px', accentColor: 'var(--mm-teal)', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ lineHeight: 1.45 }}>
                    <strong>1. {t('consent1Label')}</strong> {t('consent1Text')}
                  </span>
                </label>

                <label
                  htmlFor="consent-share-doctor"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    fontSize: '0.86rem',
                    color: 'var(--mm-ink)',
                    backgroundColor: consentShareDoctor ? 'var(--mm-teal-pale)' : 'transparent',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    border: consentShareDoctor ? '1px solid var(--mm-teal)' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    id="consent-share-doctor"
                    type="checkbox"
                    checked={consentShareDoctor}
                    onChange={(e) => setConsentShareDoctor(e.target.checked)}
                    required
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px', accentColor: 'var(--mm-teal)', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ lineHeight: 1.45 }}>
                    <strong>2. {t('consent2Label')}</strong> {t('consent2Text')}
                  </span>
                </label>

                <label
                  htmlFor="consent-simulate-abdm"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    fontSize: '0.86rem',
                    color: 'var(--mm-ink-soft)',
                    backgroundColor: consentSimulateAbdm ? 'var(--mm-teal-pale)' : 'transparent',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 'var(--mm-radius-sm)',
                    border: consentSimulateAbdm ? '1px solid var(--mm-teal)' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    id="consent-simulate-abdm"
                    type="checkbox"
                    checked={consentSimulateAbdm}
                    onChange={(e) => setConsentSimulateAbdm(e.target.checked)}
                    style={{ marginTop: '0.2rem', width: '18px', height: '18px', accentColor: 'var(--mm-teal)', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ lineHeight: 1.45 }}>
                    <strong>3. {t('consent3Label')}</strong> {t('consent3Text')}
                  </span>
                </label>
              </div>

              <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--mm-ink-soft)', borderTop: '1px dashed #cbd5e1', paddingTop: '0.55rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                <strong>{t('consentRevocability')}</strong> {t('consentRevocable')}
              </p>
            </div>

            <MmButton
              variant="primary"
              type="submit"
              disabled={isLoading || !hasConsent}
              style={{
                width: '100%',
                minHeight: '48px',
                fontSize: '1rem',
                fontWeight: 800,
                marginTop: '0.5rem',
              }}
            >
              {isLoading ? t('creatingCase') : t('startIntakeButton')}
            </MmButton>
          </form>
        </MmCard>
      </main>
    </div>
  );
}

