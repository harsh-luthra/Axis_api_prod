import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SkeletonRows } from '../components/Skeleton.jsx';

export default function Callbacks() {
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [stack, setStack] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rowState, setRowState] = useState({}); // { [id]: { status: 'loading'|'error', message?: string } }

  async function load(c) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.callbacks({ limit: 50, cursor: c, mode: 'half' });
      setData(res);
      setCursor(c);
      setRowState({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); }, []);

  function next() {
    if (data?.pagination?.nextCursor) {
      setStack(s => [...s, cursor]);
      load(data.pagination.nextCursor);
    }
  }

  function prev() {
    const last = stack[stack.length - 1] ?? null;
    setStack(s => s.slice(0, -1));
    load(last);
  }

  async function reforward(id) {
    setRowState(s => ({ ...s, [id]: { status: 'loading' } }));
    try {
      await api.reforwardCallback(id);
      setData(d => d && {
        ...d,
        callbacks: d.callbacks.map(c => c.id === id ? { ...c, callback_forwarded: 1 } : c)
      });
      setRowState(s => {
        const copy = { ...s };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      const msg = err.body?.error || err.message || 'Forward failed';
      setRowState(s => ({ ...s, [id]: { status: 'error', message: msg } }));
    }
  }

  return (
    <div>
      <h1>Callbacks</h1>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CRN</th>
              <th>Txn ID</th>
              <th>UTR</th>
              <th>Status</th>
              <th>Description</th>
              <th>Forwarded</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <SkeletonRows
                count={5}
                columns={['140px', '120px', '130px', '80px', '200px', '90px', '140px']}
              />
            )}
            {!loading && data?.callbacks?.map(c => {
              const rs = rowState[c.id];
              return (
                <tr key={c.id}>
                  <td className="mono">{c.crn}</td>
                  <td className="mono">{c.transaction_id}</td>
                  <td className="mono">{c.utr_no}</td>
                  <td>{c.transaction_status}</td>
                  <td>{c.status_description}</td>
                  <td>
                    {c.callback_forwarded ? (
                      '✓'
                    ) : rs?.status === 'loading' ? (
                      <span className="muted">Forwarding…</span>
                    ) : rs?.status === 'error' ? (
                      <button
                        className="btn-small btn-secondary"
                        onClick={() => reforward(c.id)}
                        title={rs.message}
                      >
                        Retry
                      </button>
                    ) : (
                      <button className="btn-small" onClick={() => reforward(c.id)}>
                        Forward
                      </button>
                    )}
                  </td>
                  <td>{c.received_at && new Date(c.received_at).toLocaleString('en-GB')}</td>
                </tr>
              );
            })}
            {!loading && data?.callbacks?.length === 0 && (
              <tr><td colSpan="7" className="muted">No callbacks yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button onClick={prev} disabled={stack.length === 0 || loading}>← Prev</button>
        <span className="muted">{data?.pagination?.count ?? 0} rows</span>
        <button onClick={next} disabled={!data?.pagination?.hasMore || loading}>Next →</button>
      </div>
    </div>
  );
}
