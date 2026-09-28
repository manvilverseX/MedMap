import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container" style={{ textAlign: 'center', marginTop: '5rem' }}>
      <h1>404 - Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/" style={{ display: 'inline-block', marginTop: '1rem' }}>
        Return to Home
      </Link>
    </div>
  );
}
