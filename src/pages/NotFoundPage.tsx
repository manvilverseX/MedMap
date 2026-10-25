import { Link } from 'react-router-dom';
import { useT } from '../i18n/useT';
import { MmCard, MmIcon } from '../components/ui';

export function NotFoundPage() {
  const { t } = useT();

  return (
    <div
      className="container mm-not-found-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        padding: '2rem 1rem',
        maxWidth: '540px',
      }}
    >
      <MmCard
        variant="elevated"
        className="card mm-not-found-card"
        style={{
          textAlign: 'center',
          padding: '2.5rem 2rem',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--mm-paper-deep)',
            color: 'var(--mm-coral)',
            border: '1.5px solid var(--mm-ink)',
            boxShadow: '2px 2px 0 var(--mm-ink)',
            marginBottom: '1rem',
          }}
          aria-hidden="true"
        >
          <MmIcon name="help" size={26} />
        </div>
        <h1
          style={{
            margin: '0 0 0.5rem',
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--mm-ink)',
            lineHeight: 1.2,
          }}
        >
          {t('notFoundTitle')}
        </h1>
        <p
          style={{
            margin: '0 0 1.75rem',
            fontSize: '0.95rem',
            color: 'var(--mm-ink-soft)',
            lineHeight: 1.5,
          }}
        >
          {t('notFoundMessage')}
        </p>
        <Link
          to="/"
          className="mm-button mm-button--primary mm-button--md"
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <MmIcon name="home" size={16} />
          {t('notFoundReturnHome')}
        </Link>
      </MmCard>
    </div>
  );
}

