import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { SkeletonRows } from '../components/Skeleton.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Drawer from '../components/Drawer.jsx';
import PayoutDetail from '../components/PayoutDetail.jsx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const REFRESH_INTERVAL_MS = 10000;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
  { value: 'reject', label: 'Reject' },
  { value: 'return', label: 'Return' }
];

export default function Payouts() {
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [stack, setStack] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const [statusModal, setStatusModal] = useState({ open: false, crn: null, loading: false, data: null, error: null });
  const [bulkModal, setBulkModal] = useState({ open: false, total: 0, completed: 0, current: null, running: false, stopped: false, results: [] });
  const [drawerCrn, setDrawerCrn] = useState(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const stopRef = useRef(false);

  useEffect(() => () => { stopRef.current = true; }, []);

  async function load(c, filterArg, isAutoRefresh = false) {
    const effectiveFilter = filterArg !== undefined ? filterArg : statusFilter;
    if (!isAutoRefresh) setLoading(true);
    setError(null);
    try {
      const res = await api.payouts({
        limit: 50,
        cursor: c,
        mode: 'half',
        status: effectiveFilter || undefined
      });
      setData(res);
      setCursor(c);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isAutoRefresh) setLoading(false);
    }
  }

  useEffect(() => { load(null); }, []);

  // Silent auto-refresh while there are in-flight rows on this page
  useEffect(() => {
    if (!data?.payouts?.length) return;
    if (statusModal.open || bulkModal.open) return;

    const hasInFlight = data.payouts.some(p => p.status === 'pending' || p.status === 'processing');
    if (!hasInFlight) return;

    const id = setTimeout(() => load(cursor, undefined, true), REFRESH_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [data, cursor, statusFilter, statusModal.open, bulkModal.open]);

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

  function handleFilterChange(newFilter) {
    setStatusFilter(newFilter);
    setStack([]);
    load(null, newFilter);
  }

  async function checkStatus(crn) {
    setStatusModal({ open: true, crn, loading: true, data: null, error: null });
    try {
      const res = await api.transferStatus(crn);
      setStatusModal(s => ({ ...s, loading: false, data: res }));
    } catch (err) {
      setStatusModal(s => ({ ...s, loading: false, error: err.body || { message: err.message } }));
    }
  }

  function closeModal() {
    const wasChecked = statusModal.data || statusModal.error;
    setStatusModal({ open: false, crn: null, loading: false, data: null, error: null });
    if (wasChecked) load(cursor);
  }

  async function checkAll() {
    const targets = (data?.payouts || []).filter(p => p.status !== 'processed').map(p => p.crn);
    if (targets.length === 0) return;

    stopRef.current = false;
    setBulkModal({ open: true, total: targets.length, completed: 0, current: null, running: true, stopped: false, results: [] });

    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break;
      const crn = targets[i];
      setBulkModal(s => ({ ...s, current: crn }));

      let row;
      try {
        const res = await api.transferStatus(crn);
        row = { crn, ok: true, status: res.status, statusDescription: res.statusDescription, utrNo: res.utrNo };
      } catch (err) {
        row = { crn, ok: false, error: err.body?.axisMessage || err.message };
      }

      setBulkModal(s => ({
        ...s,
        results: [...s.results, row],
        completed: s.completed + 1,
        current: null
      }));

      if (i < targets.length - 1 && !stopRef.current) {
        await sleep(1000);
      }
    }

    setBulkModal(s => ({ ...s, running: false, stopped: stopRef.current, current: null }));
  }

  function stopBulk() {
    stopRef.current = true;
  }

  function closeBulk() {
    if (bulkModal.running) return;
    const ran = bulkModal.results.length > 0;
    setBulkModal({ open: false, total: 0, completed: 0, current: null, running: false, stopped: false, results: [] });
    if (ran) load(cursor);
  }

  const unprocessedCount = (data?.payouts || []).filter(p => p.status !== 'processed').length;
  const hasInFlight = (data?.payouts || []).some(p => p.status === 'pending' || p.status === 'processing');
  const autoRefreshActive = hasInFlight && !statusModal.open && !bulkModal.open;

  return (
    <div>
      <div className="page-header">
        <h1>Payouts</h1>
        <div className="page-actions">
          <select
            className="status-filter"
            value={statusFilter}
            onChange={e => handleFilterChange(e.target.value)}
            disabled={loading}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {unprocessedCount > 0 && !bulkModal.open && (
            <button onClick={checkAll} disabled={loading}>
              Check status of all unprocessed ({unprocessedCount})
            </button>
          )}
        </div>
      </div>

      {autoRefreshActive && (
        <div className="auto-refresh-hint">
          <span className="dot pulsing" /> Auto-refreshing every {REFRESH_INTERVAL_MS / 1000}s while transactions are in flight.
        </div>
      )}

      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CRN</th>
              <th>Mode</th>
              <th>Amount</th>
              <th>Beneficiary</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <SkeletonRows
                count={5}
                columns={[
                  '140px',
                  '30px',
                  '60px',
                  [{ width: '160px' }, { width: '120px', height: 11 }],
                  '70px',
                  '140px',
                  null
                ]}
              />
            )}
            {!loading && data?.payouts?.map(p => (
              <tr key={p.id}>
                <td>
                  <button className="link-cell mono" onClick={() => setDrawerCrn(p.crn)}>
                    {p.crn}
                  </button>
                </td>
                <td>{p.txn_paymode}</td>
                <td>₹{p.txn_amount}</td>
                <td>{p.bene_name}<br /><span className="muted mono">{p.bene_acc_num}</span></td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.created_at && new Date(p.created_at).toLocaleString()}</td>
                <td>
                  {(p.status === 'processing' || p.status === 'pending') && (
                    <button className="btn-small" onClick={() => checkStatus(p.crn)}>Check status</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && data?.payouts?.length === 0 && (
              <tr><td colSpan="7" className="muted">No payouts {statusFilter ? `with status "${statusFilter}"` : 'yet'}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button onClick={prev} disabled={stack.length === 0 || loading}>← Prev</button>
        <span className="muted">{data?.pagination?.count ?? 0} rows</span>
        <button onClick={next} disabled={!data?.pagination?.hasMore || loading}>Next →</button>
      </div>

      {statusModal.open && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Status check: <span className="mono">{statusModal.crn}</span></h2>
            {statusModal.loading && <div className="muted">Checking with Axis…</div>}
            {statusModal.error && (
              <>
                <div className="error">
                  {statusModal.error.axisMessage || statusModal.error.message || 'Status check failed.'}
                </div>
                <details>
                  <summary className="muted">Details</summary>
                  <pre>{JSON.stringify(statusModal.error, null, 2)}</pre>
                </details>
              </>
            )}
            {statusModal.data && (
              <dl className="status-details">
                <dt>Status</dt>
                <dd><StatusBadge status={(statusModal.data.status || '').toLowerCase()} /></dd>
                <dt>Description</dt>
                <dd>{statusModal.data.statusDescription || '—'}</dd>
                <dt>UTR</dt>
                <dd className="mono">{statusModal.data.utrNo || '—'}</dd>
                <dt>Response code</dt>
                <dd>{statusModal.data.responseCode || '—'}</dd>
                <dt>Batch</dt>
                <dd>{statusModal.data.batchNo || '—'}</dd>
                <dt>Processing date</dt>
                <dd>{statusModal.data.processingDate || '—'}</dd>
              </dl>
            )}
            <div className="modal-actions">
              <button onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={!!drawerCrn}
        onClose={() => setDrawerCrn(null)}
        title={drawerCrn ? `Payout ${drawerCrn}` : 'Payout'}
        headerExtra={
          drawerCrn && (
            <button className="btn-small btn-secondary" onClick={() => setDrawerKey(k => k + 1)}>
              Refresh
            </button>
          )
        }
      >
        {drawerCrn && <PayoutDetail crn={drawerCrn} refreshKey={drawerKey} />}
      </Drawer>

      {bulkModal.open && (
        <div className="modal-overlay" onClick={closeBulk}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h2>Bulk status check</h2>
            <div className="bulk-progress">
              <div className="bulk-progress-bar">
                <div
                  className="bulk-progress-fill"
                  style={{ width: `${bulkModal.total ? (bulkModal.completed / bulkModal.total) * 100 : 0}%` }}
                />
              </div>
              <div className="muted bulk-status-line">
                {bulkModal.completed} / {bulkModal.total}
                {bulkModal.running && bulkModal.current && <> — checking <span className="mono">{bulkModal.current}</span>…</>}
                {!bulkModal.running && bulkModal.stopped && <> — stopped</>}
                {!bulkModal.running && !bulkModal.stopped && bulkModal.completed === bulkModal.total && <> — done</>}
              </div>
            </div>

            <div className="bulk-results">
              {bulkModal.results.map((r, i) => (
                <div key={i} className={`bulk-result-row ${r.ok ? '' : 'failed'}`}>
                  <span className="bulk-icon">{r.ok ? '✓' : '✗'}</span>
                  <span className="mono bulk-crn">{r.crn}</span>
                  {r.ok ? (
                    <span className="bulk-result-detail">
                      <StatusBadge status={(r.status || '').toLowerCase()} />
                      {r.utrNo && <span className="mono muted">{r.utrNo}</span>}
                    </span>
                  ) : (
                    <span className="bulk-result-detail muted">{r.error}</span>
                  )}
                </div>
              ))}
              {bulkModal.results.length === 0 && (
                <div className="muted">Waiting for first response…</div>
              )}
            </div>

            <div className="modal-actions">
              {bulkModal.running ? (
                <button onClick={stopBulk}>Stop</button>
              ) : (
                <button onClick={closeBulk}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

