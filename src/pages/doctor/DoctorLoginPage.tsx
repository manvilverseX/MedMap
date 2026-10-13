import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/api';
import { Button } from '../../components/Button';
import { DoctorDemoCredentials } from '../../components/doctor/DoctorDemoCredentials';

export function DoctorLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      localStorage.setItem('medmap_token', data.access_token);
      navigate('/doctor/cases');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = ({ username: demoUser, password: demoPass }: { username: string; password: string }) => {
    setUsername(demoUser);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="container" style={{ maxWidth: '440px', margin: '3.5rem auto', padding: '1rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--color-navy)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 600,
            opacity: 0.85
          }}
        >
          ← Back to Home
        </Link>
      </div>

      <div className="card">
        <h1 style={{ marginBottom: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-hand)', fontSize: '2.25rem' }}>Doctor Login</h1>

        <DoctorDemoCredentials onQuickFill={handleQuickFill} />

        {error && (
          <div
            role="alert"
            style={{
              color: 'var(--color-danger, #b91c1c)',
              backgroundColor: '#fef2f2',
              border: '1.5px solid #ef4444',
              borderRadius: '6px',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              textAlign: 'center',
              fontWeight: '500',
              fontSize: '0.9rem'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="doctor-username" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Username</label>
            <input
              id="doctor-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid var(--color-navy)', fontSize: '1rem', fontFamily: 'var(--font-sans)' }}
            />
          </div>
          <div>
            <label htmlFor="doctor-password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Password</label>
            <input
              id="doctor-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid var(--color-navy)', fontSize: '1rem', fontFamily: 'var(--font-sans)' }}
            />
          </div>
          <Button variant="primary" type="submit" isLoading={loading} style={{ marginTop: '0.5rem' }}>Login</Button>
        </form>
      </div>
    </div>
  );
}
