import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/api';
import { Button } from '../../components/Button';

export function DoctorLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
    }
  };

  return (
    <div className="container" style={{ maxWidth: '400px', margin: '4rem auto' }}>
      <div className="card">
        <h1 style={{ marginBottom: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-hand)' }}>Doctor Login</h1>
        {error && <div style={{ color: 'var(--color-danger, red)', marginBottom: '1rem', textAlign: 'center', fontWeight: '500' }}>{error}</div>}
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Username</label>
          <input 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid var(--color-navy)', fontSize: '1rem', fontFamily: 'var(--font-sans)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid var(--color-navy)', fontSize: '1rem', fontFamily: 'var(--font-sans)' }}
          />
        </div>
        <Button variant="primary" type="submit" style={{ marginTop: '0.5rem' }}>Login</Button>
      </form>
      </div>
    </div>
  );
}
