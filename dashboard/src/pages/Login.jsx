import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setApiKey, setCachedMe } from '../auth.js';

export default function Login() {
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [idleNotice] = useState(() => {
    const v = sessionStorage.getItem('idle_logout');
    if (v) sessionStorage.removeItem('idle_logout');
    return !!v;
  });
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    setApiKey(key.trim());
    try {
      const me = await api.me();
      setCachedMe(me);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Invalid API key.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Axis Payouts</h1>
        <p className="muted">Sign in with your merchant API key.</p>
        <label>
          API Key
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your X-API-Key"
            autoFocus
          />
        </label>
        {idleNotice && !error && (
          <div className="info">Signed out due to inactivity. Please sign in again.</div>
        )}
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
