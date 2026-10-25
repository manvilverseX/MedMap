import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/api';
import { MmCard, MmButton, MmIcon } from '../../components/ui';

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

  return (
    <div className="container mm-admin-login-page" style={{ maxWidth: '480px', margin: '3rem auto', padding: '1rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--mm-ink)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          <MmIcon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} />
          Back to Home
        </Link>
      </div>

      <MmCard
        variant="elevated"
        className="card mm-admin-login-card"
        style={{ padding: '2rem' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor: 'var(--mm-teal-pale)',
              color: 'var(--mm-teal-dark)',
              border: '1.5px solid var(--mm-ink)',
              boxShadow: '2px 2px 0 var(--mm-ink)',
              marginBottom: '0.75rem',
            }}
          >
            <MmIcon name="shield" size={24} />
          </div>
          <span
            style={{
              display: 'block',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--mm-teal-dark)',
              marginBottom: '0.25rem',
            }}
          >
            Hospital Operations
          </span>
          <h1
            style={{
              margin: 0,
              color: 'var(--mm-ink)',
              fontSize: '1.85rem',
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            Hospital Admin Login
          </h1>
          <p
            style={{
              margin: '0.4rem 0 0',
              fontSize: '0.85rem',
              color: 'var(--mm-ink-soft)',
              lineHeight: 1.5,
            }}
          >
            Triage queue and clinical safety alerts operations.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              color: '#b91c1c',
              backgroundColor: '#fee2e2',
              border: '1.5px solid #ef4444',
              borderRadius: 'var(--mm-radius-sm)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '0.88rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label
              htmlFor="admin-username"
              style={{
                display: 'block',
                marginBottom: '0.45rem',
                fontWeight: 700,
                fontSize: '0.88rem',
                color: 'var(--mm-ink)',
              }}
            >
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="e.g. admin"
              style={{
                width: '100%',
                padding: '0.75rem 0.9rem',
                borderRadius: 'var(--mm-radius-md)',
                border: '1.5px solid var(--mm-ink)',
                backgroundColor: 'var(--mm-white)',
                color: 'var(--mm-ink)',
                fontSize: '0.95rem',
                fontFamily: 'var(--mm-font-body)',
                boxSizing: 'border-box',
                boxShadow: 'inset 0 1px 2px rgba(8, 45, 73, 0.05)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              style={{
                display: 'block',
                marginBottom: '0.45rem',
                fontWeight: 700,
                fontSize: '0.88rem',
                color: 'var(--mm-ink)',
              }}
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.75rem 0.9rem',
                borderRadius: 'var(--mm-radius-md)',
                border: '1.5px solid var(--mm-ink)',
                backgroundColor: 'var(--mm-white)',
                color: 'var(--mm-ink)',
                fontSize: '0.95rem',
                fontFamily: 'var(--mm-font-body)',
                boxSizing: 'border-box',
                boxShadow: 'inset 0 1px 2px rgba(8, 45, 73, 0.05)',
              }}
            />
          </div>

          <MmButton
            variant="primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In to Hospital Queue'}
          </MmButton>
        </form>
      </MmCard>
    </div>
  );
}

