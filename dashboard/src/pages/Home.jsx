import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getCachedMe } from '../auth.js';
import { Skeleton } from '../components/Skeleton.jsx';

export default function Home() {
  const me = getCachedMe();
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!me?.id) return;
    api.balance(me.id)
      .then(setBalance)
      .catch(err => setError(err.message));
  }, [me?.id]);

  return (
    <div>
      <h1>Overview</h1>
      <div className="cards">
        <div className="card">
          <div className="card-label">Merchant</div>
          <div className="card-value">{me?.merchant_name || '—'}</div>
          <div className="card-sub">Corp: {me?.corp_code || '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">Axis balance</div>
          <div className="card-value">
            {balance?.axisBalance != null
              ? `₹${balance.axisBalance}`
              : error
                ? '—'
                : <Skeleton width="120px" height={24} />}
          </div>
          <div className="card-sub">
            {balance?.fetchedAt
              ? `Fetched ${new Date(balance.fetchedAt).toLocaleString()}`
              : (!error && <Skeleton width="180px" height={11} />)}
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
