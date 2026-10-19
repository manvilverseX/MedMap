import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/api';
import { Button } from '../../components/Button';

export function AdminLoginPage() {
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

      const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        let msg = 'Invalid admin credentials';
        try {
          const data = await response.json();
          if (data.detail) msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } catch {}
        throw new Error(msg);
      }

      const data = await response.json();
      localStorage.setItem('medmap_token', data.access_token);
      localStorage.setItem('medmap_role', 'admin');
      navigate('/admin/queue');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = () => {
    setUsername('admin');
    setPassword('admin123');
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
            color: 'var(--color-text-secondary)',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          ← Back to Home
        </Link>
      </div>

      <div
        className="card"
        style={{
          padding: '2rem',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🏥</span>
          <h2 style={{ margin: 0, color: 'var(--color-navy)', fontSize: '1.4rem' }}>Hospital Admin Login</h2>
        </div>
        <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-secondary)', fontSize: '0.88rem' }}>
          Triage queue and clinical safety alerts operations.
        </p>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Demo Credentials Helper Tag */}
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(2, 132, 199, 0.08)',
            border: '1px solid rgba(2, 132, 199, 0.25)',
            borderRadius: '6px',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
              Demo Hint
            </span>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-navy)', marginTop: '0.15rem' }}>
              Username: <code>admin</code> • Password: <code>admin123</code>
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickFill}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              backgroundColor: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Quick Fill
          </button>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="admin-username" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="e.g. admin"
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label htmlFor="admin-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
            />
          </div>

          <Button
            type="submit"
            isLoading={loading}
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--color-navy)', borderColor: 'var(--color-navy)' }}
          >
            Sign In to Hospital Queue
          </Button>
        </form>
      </div>
    </div>
  );
}
