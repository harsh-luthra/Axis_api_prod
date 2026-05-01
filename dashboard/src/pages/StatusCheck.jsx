import { useState } from 'react';
import { api } from '../api.js';

export default function StatusCheck() {
  const [crn, setCrn] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!crn.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.transferStatus(crn.trim());
      setResult(res);
    } catch (err) {
      setError(err.body || { message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Check Transfer Status</h1>
      <form onSubmit={handleSubmit} className="inline-form">
        <input
          type="text"
          value={crn}
          onChange={e => setCrn(e.target.value)}
          placeholder="CRN"
        />
        <button type="submit" disabled={loading}>{loading ? 'Checking…' : 'Check'}</button>
      </form>
      {error && (
        <div className="result error-block">
          <h3>Error</h3>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}
      {result && (
        <div className="result success-block">
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
