import { Link } from 'react-router-dom';
import { useT } from '../i18n/useT';

export function NotFoundPage() {
  const { t } = useT();

  return (
    <div className="container" style={{ textAlign: 'center', marginTop: '5rem' }}>
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundMessage')}</p>
      <Link to="/" style={{ display: 'inline-block', marginTop: '1rem' }}>
        {t('notFoundReturnHome')}
      </Link>
    </div>
  );
}
