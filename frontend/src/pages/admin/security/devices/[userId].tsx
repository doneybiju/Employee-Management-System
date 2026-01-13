// frontend/src/pages/admin/security/devices/[userId].tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

type KD = {
  userId: number;
  deviceId: string;
  fpHash?: string | null;
  trusted: boolean;
  firstSeen: string;
  lastSeen: string;
  lastIp?: string | null;
  lastUa?: string | null;
  lastCountry?: string | null;
  lastRegion?: string | null;
  lastCity?: string | null;
};

export default function UserDevicesPage() {
  const router = useRouter();
  const { userId } = router.query as { userId?: string };
  const { token, ready, isAuthenticated, user } = useAuth();

  const [list, setList] = useState<KD[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || user?.role !== 'super_admin') router.replace('/unauthorized');
  }, [ready, isAuthenticated, user, router]);

  async function load() {
    if (!userId) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/security/known-devices/${userId}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.items || []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (ready && isAuthenticated && user?.role === 'super_admin') load(); /* eslint-disable-next-line */ }, [userId, ready, isAuthenticated, user?.role]);

  async function setTrusted(deviceId: string, trusted: boolean) {
    await fetch(`/api/admin/security/known-devices/${userId}/${deviceId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ trusted }),
    });
    load();
  }

  async function remove(deviceId: string) {
    if (!confirm('Remove this device?')) return;
    await fetch(`/api/admin/security/known-devices/${userId}/${deviceId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    load();
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Known Devices — User {userId}</h1>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/security">← Back to logs</Link>
      </div>
      {err && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{err}</div>}

      <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#fafafa' }}>
            <tr>
              {['Device ID','Trusted','First seen','Last seen','Last IP','Last Location','Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #eee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: 16, color: '#666' }}>No devices</td></tr>
            )}
            {list.map(d => {
              const loc = [d.lastCity, d.lastRegion, d.lastCountry].filter(Boolean).join(', ') || '—';
              return (
                <tr key={d.deviceId}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.deviceId}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3' }}>{d.trusted ? '✅ Yes' : '❌ No'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3' }}>{new Date(d.firstSeen).toLocaleString()}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3' }}>{new Date(d.lastSeen).toLocaleString()}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3' }}>{d.lastIp || '—'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3' }}>{loc}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f3f3', display: 'flex', gap: 8 }}>
                    <button onClick={() => setTrusted(d.deviceId, !d.trusted)} style={{ padding: '4px 8px' }}>
                      {d.trusted ? 'Mark Untrusted' : 'Mark Trusted'}
                    </button>
                    <button onClick={() => remove(d.deviceId)} style={{ padding: '4px 8px' }}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
