import { useState } from 'react';
import { api } from '../api.js';

const PAY_MODES = [
  { value: 'PA', label: 'PA – IMPS' },
  { value: 'NE', label: 'NE – NEFT' },
  { value: 'RT', label: 'RT – RTGS' },
  { value: 'FT', label: 'FT – Fund Transfer (Axis to Axis)' },
  { value: 'CC', label: 'CC – Corporate Cheques' },
  { value: 'DD', label: 'DD – Demand Draft' }
];

const TXN_TYPES = [
  { value: 'CUST', label: 'CUST – Customer Payment' },
  { value: 'MERC', label: 'MERC – Merchant Payment' },
  { value: 'DIST', label: 'DIST – Distributor Payment' },
  { value: 'INTN', label: 'INTN – Internal Payment' },
  { value: 'VEND', label: 'VEND – Vendor Payment' }
];

const initial = () => ({
  txnPaymode: 'RT',
  custUniqRef: '',
  txnType: 'CUST',
  txnAmount: '',
  beneCode: 'MERCHANT001',
  beneName: '',
  valueDate: new Date().toISOString().slice(0, 10),
  beneAccNum: '',
  beneIfscCode: ''
});

function generateCrn() {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 101);
  return `AXIS${ts}${rand}`;
}

export default function NewTransfer() {
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const isEpayment = form.txnPaymode === 'RT' || form.txnPaymode === 'NE';
    if (isEpayment && /[^a-zA-Z0-9 ]/.test(form.beneName)) {
      setError({ message: 'Beneficiary name cannot contain special characters for RTGS/NEFT.' });
      setResult(null);
      return;
    }

    const amount = parseFloat(form.txnAmount);
    if (isNaN(amount) || amount <= 10) {
      setError({ message: 'Amount must be a number greater than 10.' });
      setResult(null);
      return;
    }
    const payload = { ...form, txnAmount: amount.toFixed(2) };

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.fundTransfer(payload);
      setResult(res);
    } catch (err) {
      setError(err.body || { message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>New Fund Transfer</h1>
      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          <span>CRN (custUniqRef)</span>
          <div className="field-inputs">
            <input
              type="text"
              value={form.custUniqRef}
              onChange={e => update('custUniqRef', e.target.value)}
              required
            />
            <button type="button" className="btn-secondary" onClick={() => update('custUniqRef', generateCrn())}>
              Random
            </button>
          </div>
        </label>

        <label>
          <span>Amount</span>
          <div className="currency-input">
            <span className="currency-symbol">₹</span>
            <input
              type="number"
              inputMode="decimal"
              min="10.01"
              step="0.01"
              value={form.txnAmount}
              onChange={e => update('txnAmount', e.target.value)}
              required
            />
          </div>
          <small className="field-hint">Must be greater than 10. Sent with 2 decimals (e.g. 25 → 25.00).</small>
        </label>

        <label>
          <span>Pay mode</span>
          <select value={form.txnPaymode} onChange={e => update('txnPaymode', e.target.value)} required>
            {PAY_MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label>
          <span>Txn type</span>
          <select value={form.txnType} onChange={e => update('txnType', e.target.value)} required>
            {TXN_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label>
          <span>Value date</span>
          <input
            type="date"
            value={form.valueDate}
            onChange={e => update('valueDate', e.target.value)}
            required
          />
        </label>

        <label>
          <span>Beneficiary code</span>
          <input
            type="text"
            value={form.beneCode}
            onChange={e => update('beneCode', e.target.value)}
            required
          />
        </label>

        <label>
          <span>Beneficiary name</span>
          <input
            type="text"
            value={form.beneName}
            onChange={e => update('beneName', e.target.value)}
            required
            maxLength={70}
          />
          <small className="field-hint">Max 70 chars. No special characters for RTGS/NEFT.</small>
        </label>

        <label>
          <span>Beneficiary account #</span>
          <input
            type="text"
            value={form.beneAccNum}
            onChange={e => update('beneAccNum', e.target.value)}
            required
            maxLength={30}
          />
          <small className="field-hint">Max 30 chars.</small>
        </label>

        <label>
          <span>Beneficiary IFSC</span>
          <input
            type="text"
            value={form.beneIfscCode}
            onChange={e => update('beneIfscCode', e.target.value.toUpperCase())}
            required
            maxLength={11}
            pattern="[A-Z]{4}0[A-Z0-9]{6}"
          />
          <small className="field-hint">11 chars, e.g. AXIS0001234.</small>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit transfer'}
          </button>
        </div>
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
