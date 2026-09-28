import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';

export function LandingPage() {
  return (
    <>
      <Badge text="The project is under development" />
      
      <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <header style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="logo" style={{ fontSize: '4.5rem' }}>MedMap</div>
        </header>

        <main style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Link 
            to="/patient" 
            className="doc-btn doc-btn-primary" 
            style={{ padding: '1.25rem', fontSize: '1.15rem' }}
          >
            Patient Entry
          </Link>
          <Link 
            to="/doctor/login" 
            className="doc-btn doc-btn-secondary" 
            style={{ padding: '1.25rem', fontSize: '1.15rem' }}
          >
            Doctor Login
          </Link>
        </main>
      </div>
    </>
  );
}
