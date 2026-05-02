import { getApiKey, clearAuth } from './auth.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  const key = getApiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-API-Key'] = key;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok) {
    if (res.status === 401) clearAuth();
    throw new ApiError(data?.error || `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

export const api = {
  me: () => request('GET', '/me'),
  payouts: ({ limit = 50, cursor, mode = 'full', status } = {}) => {
    const qs = new URLSearchParams({ limit, mode });
    if (cursor) qs.set('cursor', cursor);
    if (status) qs.set('status', status);
    return request('GET', `/payouts?${qs}`);
  },
  payoutDetail: (crn) => request('GET', `/payouts/${encodeURIComponent(crn)}`),
  callbacks: ({ limit = 50, cursor, mode = 'full' } = {}) => {
    const qs = new URLSearchParams({ limit, mode });
    if (cursor) qs.set('cursor', cursor);
    return request('GET', `/axis-callbacks?${qs}`);
  },
  reforwardCallback: (id) => request('POST', `/axis-callbacks/${id}/reforward`),
  balance: (merchantId) => request('GET', `/balance/${merchantId}`),
  fundTransfer: (payload) => request('POST', '/fund-transfer', payload),
  transferStatus: (crn) => request('POST', '/fund-transfer/status', { crn })
};
