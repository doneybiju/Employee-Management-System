// frontend/src/pages/admin/security/alerts.tsx
import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/router';
import {useAuth} from '@/context/AuthContext';

type Alert = {
  id: number;
  createdAt: string;
  kind: string;
  severity: 'low' | 'medium' | 'high';
  userId?: number | null;
  email?: string | null;
  ip?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  deviceId?: string | null;
  loginEventId?: number | null;
  details?: any;
  resolvedAt?: string | null;
};

export default function AlertsPage() {
  const {ready, isAuthenticated, user, token} = useAuth();
  const router = useRouter();

  const [severity, setSeverity] = useState<'all' | 'low' | 'medium' | 'high'>(
    'all',
  );
  const [resolved, setResolved] = useState<'all' | 'open' | 'resolved'>('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Alert[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || user?.role !== 'super_admin')
      router.replace('/unauthorized');
  }, [ready, isAuthenticated, user, router]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '25');
    if (severity !== 'all') p.set('severity', severity);
    if (resolved !== 'all')
      p.set('resolved', resolved === 'resolved' ? 'true' : 'false');
    return p.toString();
  }, [page, severity, resolved]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/security/alerts?${qs}`, {
      credentials: 'include',
      headers: token ? {Authorization: `Bearer ${token}`} : undefined,
    });
    const data = await res.json();
    setRows(data.items || []);
    setTotal(data.total ?? null);
    setLoading(false);
  }
  useEffect(() => {
    if (ready && isAuthenticated && user?.role === 'super_admin')
      load(); /* eslint-disable-next-line */
  }, [qs, ready, isAuthenticated, user?.role]);

  async function setAlertResolved(id: number, val: boolean) {
    await fetch(`/api/admin/security/alerts/${id}/resolve`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify({resolved: val}),
    });
    load();
  }

  return (
    <main style={{padding: 24}}>
      <h1 style={{marginBottom: 12}}>Security › Alerts</h1>

      <div style={{display: 'flex', gap: 12, marginBottom: 12}}>
        <select
          value={severity}
          onChange={e => {
            setPage(1);
            setSeverity(e.target.value as any);
          }}
        >
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={resolved}
          onChange={e => {
            setPage(1);
            setResolved(e.target.value as any);
          }}
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          onClick={() => {
            setPage(1);
            load();
          }}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div
        style={{overflowX: 'auto', border: '1px solid #eee', borderRadius: 8}}
      >
        <table
          style={{width: '100%', borderCollapse: 'collapse', fontSize: 14}}
        >
          <thead style={{background: '#fafafa'}}>
            <tr>
              {[
                'Time',
                'Kind',
                'Severity',
                'User/Email',
                'IP',
                'Location',
                'Device',
                'Details',
                'Resolved',
                'Actions',
              ].map(h => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: 8,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={10} style={{padding: 16, color: '#666'}}>
                  No alerts
                </td>
              </tr>
            )}
            {rows.map(a => {
              const loc =
                [a.city, a.region, a.country].filter(Boolean).join(', ') || '—';
              const sevClr =
                a.severity === 'high'
                  ? '#b91c1c'
                  : a.severity === 'medium'
                    ? '#b45309'
                    : '#2563eb';
              return (
                <tr key={a.id}>
                  <td
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #f3f3f3',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {a.kind}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #f3f3f3',
                      color: sevClr,
                    }}
                  >
                    {a.severity}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {a.userId ?? '—'} / {a.email ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {a.ip ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {loc}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #f3f3f3',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {a.deviceId ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {a.details ? JSON.stringify(a.details) : '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {a.resolvedAt ? '✅' : '❌'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    <button
                      onClick={() => setAlertResolved(a.id, !a.resolvedAt)}
                    >
                      {a.resolvedAt ? 'Reopen' : 'Resolve'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 10}}
      >
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
        >
          Prev
        </button>
        <span>
          Page {page}
          {total ? ` / ${Math.max(1, Math.ceil(total / 25))}` : ''}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={
            loading || (total !== null && page >= Math.ceil(total / 25))
          }
        >
          Next
        </button>
      </div>
    </main>
  );
}
