import { Link } from 'react-router-dom';
import { ProblemStatementBadge } from '../components/ProblemStatementBadge';
import { useT } from '../i18n/useT';
import { MmCard, MmIcon } from '../components/ui';

export function LandingPage() {
  const { t } = useT();

  return (
    <div className="mm-landing-wrapper">
      <ProblemStatementBadge />

      <div
        className="container mm-landing-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '85vh',
          padding: '4.5rem 1.5rem 2.5rem',
          maxWidth: '720px',
        }}
      >
        <header
          style={{
            marginBottom: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '0 0.5rem',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: 'var(--mm-teal)',
              color: 'var(--mm-white)',
              border: '2px solid var(--mm-ink)',
              boxShadow: '3px 3px 0 var(--mm-ink)',
              fontSize: '2rem',
              fontWeight: 800,
              marginBottom: '1rem',
            }}
            aria-hidden="true"
          >
            +
          </div>
          <h1
            className="logo mm-landing-title"
            style={{
              fontSize: '3.6rem',
              margin: '0 0 0.5rem',
              color: 'var(--mm-ink)',
              lineHeight: 1.1,
            }}
          >
            {t('landingTitle')}
          </h1>
          <p
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--mm-ink-soft)',
              margin: '0.25rem 0 0',
              fontFamily: 'var(--mm-font-body)',
              maxWidth: '520px',
            }}
          >
            {t('landingSubtitle')}
          </p>

          <div
            style={{
              marginTop: '1.25rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 0.9rem',
              borderRadius: 'var(--mm-radius-pill)',
              backgroundColor: 'var(--mm-paper-deep)',
              border: '1px solid var(--mm-line)',
              fontSize: '0.78rem',
              color: 'var(--mm-ink-soft)',
              fontWeight: 600,
              maxWidth: '100%',
              textAlign: 'center',
            }}
            role="note"
          >
            <MmIcon name="spark" size={14} style={{ color: 'var(--mm-teal)', flexShrink: 0 }} />
            <span>{t('aiNotice')}</span>
          </div>
        </header>

        <main
          style={{
            width: '100%',
            maxWidth: '540px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <MmCard
            variant="elevated"
            className="mm-landing-card mm-landing-card--patient"
            style={{ padding: '1.35rem 1.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '200px', flex: 1 }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--mm-teal-pale)',
                    color: 'var(--mm-teal-dark)',
                    border: '1.5px solid var(--mm-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <MmIcon name="users" size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--mm-ink)' }}>
                    {t('landingPatientCard')}
                  </h2>
                </div>
              </div>
              <Link
                to="/patient"
                className="doc-btn doc-btn-primary mm-button mm-button--primary mm-button--lg"
                style={{
                  padding: '0.75rem 1.4rem',
                  fontSize: '1rem',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('landingPatientEntry')}
              </Link>
            </div>
          </MmCard>

          <MmCard
            variant="default"
            className="mm-landing-card mm-landing-card--doctor"
            style={{ padding: '1.35rem 1.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '200px', flex: 1 }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--mm-paper-deep)',
                    color: 'var(--mm-ink)',
                    border: '1.5px solid var(--mm-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <MmIcon name="file" size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--mm-ink)' }}>
                    {t('landingDoctorCard')}
                  </h2>
                </div>
              </div>
              <Link
                to="/doctor/login"
                className="doc-btn doc-btn-secondary mm-button mm-button--secondary mm-button--lg"
                style={{
                  padding: '0.75rem 1.4rem',
                  fontSize: '1rem',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('landingDoctorLogin')}
              </Link>
            </div>
          </MmCard>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <Link
              to="/admin/login"
              className="mm-landing-admin-link"
              style={{
                fontSize: '0.88rem',
                color: 'var(--mm-ink-soft)',
                textDecoration: 'none',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--mm-radius-sm)',
                transition: 'color 0.15s ease',
              }}
            >
              {t('landingAdminLogin')}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

