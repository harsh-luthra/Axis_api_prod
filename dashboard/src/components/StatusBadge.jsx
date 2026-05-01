export default function StatusBadge({ status }) {
  const cls = {
    processed: 'badge-success',
    processing: 'badge-info',
    pending: 'badge-warn',
    failed: 'badge-error',
    reject: 'badge-error',
    return: 'badge-warn'
  }[status] || 'badge-default';
  return <span className={`badge ${cls}`}>{status || '—'}</span>;
}
