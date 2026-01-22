// frontend/src/pages/admin/security.tsx
import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/router';
import {useAuth} from '@/context/AuthContext';
import Link from 'next/link';

type Row = {
  id: number;
  createdAt: string;
  email?: string | null;
  userId?: number | null;
  success: boolean;
  failReason?: string | null;
  ip: string;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceId?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  rateLimitLimit?: number | null;
  rateLimitRemaining?: number | null;
  rateLimitResetAt?: string | null;
  statusCode?: number | null;
  ua?: string | null;
  // NEW flags
  isNewDevice?: boolean;
  isNewCountry?: boolean;
};

export default function SecurityLogs() {
  const {ready, isAuthenticated, user, token} = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [successFilter, setSuccessFilter] = useState<
    'all' | 'success' | 'fail'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  // gate: super_admin only
  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || user?.role !== 'super_admin')
      router.replace('/unauthorized');
  }, [ready, isAuthenticated, user, router]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', String(pageSize));
    if (email.trim()) p.set('email', email.trim());
    if (successFilter === 'success') p.set('success', 'true');
    if (successFilter === 'fail') p.set('success', 'false');
    return p.toString();
  }, [page, pageSize, email, successFilter]);

  async function fetchData() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/security/login-events?${qs}`, {
        credentials: 'include',
        headers: token ? {Authorization: `Bearer ${token}`} : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setRows(items);
      setTotal(typeof data.total === 'number' ? data.total : null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && isAuthenticated && user?.role === 'super_admin') fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, ready, isAuthenticated, user?.role]);

  async function downloadCsv() {
    try {
      const res = await fetch(
        `/api/admin/security/login-events?${qs}&format=csv`,
        {
          credentials: 'include',
          headers: token ? {Authorization: `Bearer ${token}`} : undefined,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'login-events.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('CSV download failed');
    }
  }

  async function clearLogs() {
    if (
      !confirm(
        email.trim()
          ? `Clear ALL login events for ${email.trim()}?`
          : 'Clear ALL login events?',
      )
    )
      return;

    setLoading(true);
    setErr(null);
    try {
      const url = `/api/admin/security/login-events${
        email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''
      }`;
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: token ? {Authorization: `Bearer ${token}`} : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPage(1);
      await fetchData();
    } catch (e: any) {
      setErr(e?.message || 'Clear failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{padding: 24}}>
      <h1 style={{marginBottom: 12}}>Security › Login Events</h1>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          value={email}
          onChange={e => {
            setPage(1);
            setEmail(e.target.value);
          }}
          placeholder="Filter by email"
          style={{
            padding: 8,
            border: '1px solid #ddd',
            borderRadius: 6,
            minWidth: 260,
          }}
        />
        <select
          value={successFilter}
          onChange={e => {
            setPage(1);
            setSuccessFilter(e.target.value as any);
          }}
          style={{padding: 8, border: '1px solid #ddd', borderRadius: 6}}
        >
          <option value="all">All</option>
          <option value="success">Success only</option>
          <option value="fail">Failed only</option>
        </select>
        <button
          onClick={() => {
            setPage(1);
            fetchData();
          }}
          disabled={loading}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: '#f8f8f8',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          onClick={downloadCsv}
          style={{
            marginLeft: 'auto',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: '#f0f7ff',
          }}
        >
          Download CSV
        </button>

        <button
          onClick={clearLogs}
          disabled={loading}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: '#fff0f0',
          }}
        >
          Clear logs
        </button>
      </div>

      {err && <div style={{color: '#b91c1c', marginBottom: 8}}>{err}</div>}

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
                'Email',
                'Result',
                'Reason',
                'IP',
                'Browser/OS',
                'Device',
                'Loc',
                'DeviceId',
                'RL',
                'Code',
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
                <td colSpan={12} style={{padding: 16, color: '#666'}}>
                  No rows
                </td>
              </tr>
            )}
            {rows.map(r => {
              const when = new Date(r.createdAt).toLocaleString();
              const rl =
                (r.rateLimitLimit ?? '-') + '/' + (r.rateLimitRemaining ?? '-');
              const loc = [r.city, r.region, r.country]
                .filter(Boolean)
                .join(', ');
              const resStr = r.success ? '✅ success' : '❌ fail';
              const deviceBadge = r.isNewDevice ? '  (NEW)' : '';
              const countryBadge = r.isNewCountry ? '  (NEW)' : '';
              return (
                <tr key={r.id}>
                  <td
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #f3f3f3',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {when}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.email ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {resStr}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.failReason ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.ip}
                  </td>
                  <td
                    style={{padding: 8, borderBottom: '1px solid ' + '#f3f3f3'}}
                  >
                    {[r.browser, r.os].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.deviceType || '—'}
                    {deviceBadge}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {loc || '—'}
                    {countryBadge}
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
                    {r.deviceId || '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {rl}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.statusCode ?? '—'}
                  </td>
                  <td style={{padding: 8, borderBottom: '1px solid #f3f3f3'}}>
                    {r.userId ? (
                      <Link href={`/admin/security/devices/${r.userId}`}>
                        Devices
                      </Link>
                    ) : (
                      '—'
                    )}
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
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        >
          Prev
        </button>
        <span>
          Page {page}
          {total ? ` / ${Math.max(1, Math.ceil(total / pageSize))}` : ''}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={
            loading || (total !== null && page >= Math.ceil(total / pageSize))
          }
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        >
          Next
        </button>
      </div>
    </main>
  );
}
