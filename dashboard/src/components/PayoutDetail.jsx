import { useEffect, useState } from 'react';
import { api } from '../api.js';
import StatusBadge from './StatusBadge.jsx';
import { Skeleton } from './Skeleton.jsx';

export default function PayoutDetail({ crn, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!crn) return;
    setData(null);
    setError(null);
    setLoading(true);
    api.payoutDetail(crn)
      .then(setData)
      .catch(err => setError(err.status === 404 ? 'Payout not found.' : err.message))
      .finally(() => setLoading(false));
  }, [crn, refreshKey]);

  if (error) return <div className="error">{error}</div>;

  if (loading || !data) {
    return (
      <div>
        <div className="detail-summary">
          <Skeleton width="180px" height={16} />
          <Skeleton width="80px" height={20} radius={999} />
          <Skeleton width="100px" height={28} style={{ marginLeft: 'auto' }} />
        </div>
        <Skeleton width="50%" height={14} />
        <div style={{ marginTop: 12 }}><Skeleton width="100%" height={14} /></div>
        <div style={{ marginTop: 8 }}><Skeleton width="100%" height={14} /></div>
        <div style={{ marginTop: 8 }}><Skeleton width="80%" height={14} /></div>
      </div>
    );
  }

  const { payout, callbacks } = data;

  return (
    <div>
      <div className="detail-summary">
        <span className="mono detail-crn">{payout.crn}</span>
        <StatusBadge status={payout.status} />
        <span className="detail-amount">₹{payout.txn_amount}</span>
      </div>

      <h3 className="detail-section-title">Payment</h3>
      <dl className="detail-fields">
        <Field label="Pay mode" value={payout.txn_paymode} />
        <Field label="Txn type" value={payout.txn_type} />
        <Field label="Value date" value={fmtDate(payout.value_date)} />
        <Field label="Status description" value={payout.status_description} wide />
        <Field label="Response code" value={payout.response_code} />
        <Field label="UTR" value={payout.utr_no} mono />
        <Field label="Batch #" value={payout.batch_no} />
        <Field label="Transaction ID" value={payout.transaction_id} mono />
      </dl>

      <h3 className="detail-section-title">Beneficiary</h3>
      <dl className="detail-fields">
        <Field label="Code" value={payout.bene_code} />
        <Field label="Name" value={payout.bene_name} />
        <Field label="Account #" value={payout.bene_acc_num} mono />
        <Field label="IFSC" value={payout.bene_ifsc_code} mono />
        <Field label="Bank" value={payout.bene_bank_name} />
        <Field label="Email" value={payout.bene_email_addr1} />
        <Field label="Mobile" value={payout.bene_mobile_no} />
      </dl>

      <h3 className="detail-section-title">
        Callbacks <span className="muted">({callbacks.length})</span>
      </h3>
      {callbacks.length === 0 ? (
        <div className="muted">No callbacks received yet.</div>
      ) : (
        <ul className="timeline">
          {callbacks.map(c => (
            <li key={c.id}>
              <div className="timeline-time">
                {c.received_at && new Date(c.received_at).toLocaleString('en-GB')}
              </div>
              <div className="timeline-row">
                <StatusBadge status={(c.transaction_status || '').toLowerCase()} />
                <span>{c.status_description || '—'}</span>
              </div>
              <div className="timeline-meta">
                <span>UTR: <span className="mono">{c.utr_no || '—'}</span></span>
                <span>Resp: {c.response_code || '—'}</span>
                <span>Batch: {c.batch_no || '—'}</span>
                <span>
                  Forwarded:{' '}
                  {c.callback_forwarded ? <span className="badge badge-success">yes</span> : <span className="badge badge-warn">no</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="detail-section-title">Timestamps</h3>
      <dl className="detail-fields">
        <Field label="Created" value={fmtDateTime(payout.created_at)} />
        <Field label="Updated" value={fmtDateTime(payout.updated_at)} />
      </dl>
    </div>
  );
}

function Field({ label, value, mono, wide }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={`${mono ? 'mono' : ''} ${wide ? 'detail-wide' : ''}`}>
        {value || '—'}
      </dd>
    </>
  );
}

function fmtDate(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('en-GB'); } catch { return String(d); }
}

function fmtDateTime(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleString('en-GB'); } catch { return String(d); }
}
