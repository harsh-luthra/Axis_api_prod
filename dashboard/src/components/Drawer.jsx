import { useEffect } from 'react';

export default function Drawer({ open, onClose, title, headerExtra, children, wide }) {
  useEffect(() => {
    if (!open) return;
    function onEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className={`drawer ${wide ? 'drawer-wide' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="drawer-header">
          <h2>{title}</h2>
          <div className="drawer-header-actions">
            {headerExtra}
            <button className="btn-link drawer-close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
