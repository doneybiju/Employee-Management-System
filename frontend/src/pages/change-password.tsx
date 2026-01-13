// frontend/src/pages/change-password.tsx
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const ruleMsg =
  'Min 12 chars, include upper, lower, digit, symbol. No spaces.';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { logout } = useAuth();

  // if URL has ?token=... we are in reset mode (unauthenticated)
  const token =
    typeof router.query.token === 'string' ? router.query.token : '';
  const isReset = !!token;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const valid =
    newPassword.length >= 12 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword) &&
    !/\s/.test(newPassword) &&
    newPassword === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (!valid) {
      setErr('Password does not meet rules or confirm mismatch');
      return;
    }
    setLoading(true);
    try {
      if (isReset) {
        // unauthenticated reset using token
        const res = await fetch(`${API}/api/password/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Reset failed');
        setOk(true);
        alert('Password updated. Please log in.');
        router.replace('/login');
      } else {
        // authenticated change
        const res = (await fetchWithAuth('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        })) as any;

        if (res?.ok) {
          setOk(true);
          // force re-login after change
          logout();
          router.replace('/login');
        } else {
          throw new Error(res?.error || 'Change failed');
        }
      }
    } catch (e: any) {
      setErr(e?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  const ruleOk = (r: boolean) => ({
    display: 'inline-block',
    width: 8, height: 8, borderRadius: 9999,
    background: r ? '#10b981' : '#d1d5db',
    marginRight: 8,
  } as const);

  return (
    <main style={{ maxWidth: 520, margin: '2rem auto', padding: 16 }}>
      <div style={{
        background:'#fff', border:'1px solid #eee', borderRadius:10,
        padding:16, boxShadow:'0 4px 6px rgba(0,0,0,0.05)'
      }}>
        <h1 style={{ marginTop:0, marginBottom:8 }}>
          {isReset ? 'Set a new password' : 'Change Password'}
        </h1>
        <p style={{ color:'#6b7280', marginTop:0 }}>{ruleMsg}</p>

        {/* live rule hints */}
        <ul style={{ listStyle:'none', padding:0, margin:'8px 0 14px', color:'#6b7280', fontSize:13 }}>
          <li><span style={ruleOk(newPassword.length >= 12)} />12+ characters</li>
          <li><span style={ruleOk(/[A-Z]/.test(newPassword))} />Uppercase letter</li>
          <li><span style={ruleOk(/[a-z]/.test(newPassword))} />Lowercase letter</li>
          <li><span style={ruleOk(/\d/.test(newPassword))} />Number</li>
          <li><span style={ruleOk(/[^A-Za-z0-9]/.test(newPassword))} />Symbol</li>
          <li><span style={ruleOk(!/\s/.test(newPassword))} />No spaces</li>
          <li><span style={ruleOk(newPassword === confirm && confirm.length>0)} />Matches confirm</li>
        </ul>

        {err && <div style={{ background:'#fdecea', color:'#b91c1c', padding:10, borderRadius:8, marginBottom:10 }}>{err}</div>}
        {ok && <div style={{ background:'#ecfdf5', color:'#065f46', padding:10, borderRadius:8, marginBottom:10 }}>Password updated.</div>}

        <form onSubmit={onSubmit} noValidate style={{ display:'grid', gap:12 }}>
          {!isReset && (
            <label>
              <div style={{ fontSize:13, color:'#6b7280' }}>Current password</div>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8 }}
                required
              />
            </label>
          )}

          <label>
            <div style={{ fontSize:13, color:'#6b7280' }}>New password</div>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8 }}
              required
            />
          </label>

          <label>
            <div style={{ fontSize:13, color:'#6b7280' }}>Confirm new password</div>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8 }}
              required
            />
          </label>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:6 }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{ padding:'10px 14px', border:'1px solid #ddd', borderRadius:8, background:'#fff', cursor:'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              style={{ padding:'10px 14px', border:'none', borderRadius:8, background: valid ? '#1e90ff' : '#9ca3af', color:'#fff', cursor: valid && !loading ? 'pointer' : 'not-allowed' }}
            >
              {loading ? 'Saving…' : (isReset ? 'Set password' : 'Change password')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
