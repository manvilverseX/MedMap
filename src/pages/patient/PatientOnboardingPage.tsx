import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { createCase } from '../../utils/api';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';

export function PatientOnboardingPage() {
  const [patientId, setPatientId] = useState('');
  const [language, setLanguage] = useState('English');
  const [hasConsent, setHasConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setCaseId } = useCase();

  useEffect(() => {
    // Clear any stale active case when starting a fresh onboarding session
    setCaseId(null);
  }, [setCaseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim() || !hasConsent) return;

    setIsLoading(true);
    setError(null);
    try {
      const newCase = await createCase(patientId, language, hasConsent);
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
      <main style={{ marginTop: '2rem', maxWidth: '400px' }}>
        <h2>Welcome to MedMap</h2>
        <p>Please enter your details to start.</p>
        
        <ErrorMessage message={error} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="patientId" style={{ display: 'block', marginBottom: '0.5rem' }}>Patient ID:</label>
            <input 
              id="patientId"
              type="text" 
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="e.g. p-12345"
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div>
            <label htmlFor="language" style={{ display: 'block', marginBottom: '0.5rem' }}>Preferred Language:</label>
            <select 
              id="language"
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Kannada">Kannada</option>
            </select>
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
