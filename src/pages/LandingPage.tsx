import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { useT } from '../i18n/useT';

export function LandingPage() {
  const { t } = useT();

  return (
    <>
      <Badge text={t('landingUnderDevelopment')} />
      
      <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <header style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="logo" style={{ fontSize: '4.5rem' }}>{t('landingTitle')}</div>
        </header>

        <main style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Link 
            to="/patient" 
            className="doc-btn doc-btn-primary" 
            style={{ padding: '1.25rem', fontSize: '1.15rem' }}
          >
            {t('landingPatientEntry')}
          </Link>
          <Link 
            to="/doctor/login" 
            className="doc-btn doc-btn-secondary" 
            style={{ padding: '1.25rem', fontSize: '1.15rem' }}
          >
            {t('landingDoctorLogin')}
          </Link>
          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            <Link
              to="/admin/login"
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {t('landingAdminLogin')}
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
