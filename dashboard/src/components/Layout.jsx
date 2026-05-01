import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { clearAuth, getCachedMe, setCachedMe } from '../auth.js';
import useIdleLogout from '../hooks/useIdleLogout.js';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export default function Layout() {
  const [me, setMe] = useState(getCachedMe());
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (me) return;
    api.me()
      .then(data => { setMe(data); setCachedMe(data); })
      .catch(err => {
        if (err.status === 401) {
          clearAuth();
          navigate('/login', { replace: true });
        }
      });
  }, [me, navigate]);

  const [confirmLogout, setConfirmLogout] = useState(false);

  function handleLogout() {
    setConfirmLogout(true);
  }

  function performLogout() {
    setConfirmLogout(false);
    clearAuth();
    navigate('/login', { replace: true });
  }

  const handleIdle = useCallback(() => {
    sessionStorage.setItem('idle_logout', '1');
    clearAuth();
    navigate('/login', { replace: true });
  }, [navigate]);

  useIdleLogout(IDLE_TIMEOUT_MS, handleIdle);

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <header className="mobile-header">
        <button
          className="hamburger"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
        >☰</button>
        <div className="brand-mobile">Axis Payouts</div>
        <button className="btn-link mobile-signout" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={closeNav} />}

      <aside className="sidebar">
        <div className="brand">Axis Payouts</div>
        <nav>
          <NavLink to="/" end onClick={closeNav}>Overview</NavLink>
          <NavLink to="/payouts" onClick={closeNav}>Payouts</NavLink>
          <NavLink to="/callbacks" onClick={closeNav}>Callbacks</NavLink>
          <NavLink to="/transfer/new" onClick={closeNav}>New Transfer</NavLink>
          <NavLink to="/transfer/status" onClick={closeNav}>Check Status</NavLink>
        </nav>
        <div className="sidebar-footer">
          {me && <div className="merchant-name">{me.merchant_name}</div>}
          <button className="btn-link" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>

      {confirmLogout && (
        <div className="modal-overlay" onClick={() => setConfirmLogout(false)}>
          <div className="modal modal-confirm" onClick={e => e.stopPropagation()}>
            <h2>Sign out?</h2>
            <p className="muted">You'll need your API key to sign back in.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmLogout(false)}>
                Cancel
              </button>
              <button onClick={performLogout}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
