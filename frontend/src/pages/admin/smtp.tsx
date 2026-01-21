import Head from 'next/head';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/lib/api';
import s from './smtp.module.css';

type Form = {
  host: string;
  // allow '' (blank) as well as number
  port: number | '' ;
  encryption: 'AUTO' | 'NONE' | 'STARTTLS' | 'TLS';
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  hasPassword?: boolean;
};


function PageInner() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{text:string; ok:boolean} | null>(null);

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{text:string; ok:boolean} | null>(null);

  useEffect(() => {
  (async () => {
    const res = await fetchWithAuth('/api/admin/smtp');
    const cfg = await res.json();
    setForm({
      host: cfg?.host ?? '',
      port: cfg?.port && Number(cfg.port) > 0 ? Number(cfg.port) : '', // blank if 0/undefined
      encryption: (['NONE','STARTTLS','TLS','AUTO'].includes(cfg?.encryption) ? cfg.encryption : 'AUTO') as Form['encryption'],
      user: cfg?.user ?? '',
      pass: '',
      fromName: cfg?.fromName ?? '',
      fromEmail: cfg?.fromEmail ?? '',
      hasPassword: !!cfg?.hasPassword,
    });
  })();
}, []);


  if (loading || !form) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!user || user.role !== 'super_admin') return <main style={{ padding: 24 }}>Forbidden.</main>;

  const onChange = (k: keyof Form, v: any) => setForm({ ...form, [k]: v });

  async function save() {
    if (!form) return;
  setSaving(true); setMsg(null);
  // add this helper inside save()
    const resolveEnc = (enc: Form['encryption'], port: number | ''): 'NONE'|'STARTTLS'|'TLS' => {
      if (enc !== 'AUTO') return enc;
      const p = typeof port === 'number' ? port : 0;
      if (p === 465) return 'TLS';
      if (p === 587) return 'STARTTLS';
      return 'NONE';
    };

  try {
    const body: any = {
  host: form.host,
  port: form.port === '' ? null : Number(form.port),
  encryption: resolveEnc(form.encryption, form.port),
  user: form.user,
  fromName: form.fromName,
  fromEmail: form.fromEmail,
};
    if (form.pass) body.pass = form.pass; // only send if changed

    const res = await fetchWithAuth('/api/admin/smtp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || `HTTP ${res.status}`);
    }
    setMsg({ text: 'Settings saved successfully', ok: true });
    setForm(f => f ? ({ ...f, pass: '', hasPassword: true }) : f);
  } catch (e: any) {
    setMsg({ text: e?.message || 'Save failed', ok: false });
  } finally {
    setSaving(false);
  }
}


  async function sendTest() {
  setTesting(true); setTestMsg(null);
  try {
    const res = await fetchWithAuth('/api/admin/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ to: testTo }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || `HTTP ${res.status}`);
    }
    setTestMsg({ text: 'Test email sent successfully', ok: true });
  } catch (e: any) {
    setTestMsg({ text: e?.message || 'Test failed', ok: false });
  } finally {
    setTesting(false);
  }
}


  return (
    <>
      <Head>
        <title>SMTP Settings | Admin</title>
        <link rel="stylesheet"
              href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </Head>

      <main className={s['admin-container']}>
        <div className={s['admin-header']}>
          <h1 className={s['admin-title']}>SMTP Settings</h1>
          <p className={s['admin-subtitle']}>Configure your email server settings for system notifications</p>
        </div>

        <section className={s.card}>
          <h2 className={s['card-title']}>
            <i className="fas fa-server" aria-hidden="true" />
            SMTP Configuration
          </h2>

          <div className={s['form-grid']}>
            <div className={s['form-group']}>
              <label className={s['form-label']}>Host</label>
              <input className={s['form-input']} value={form.host} onChange={e => onChange('host', e.target.value)} placeholder="smtp.example.com" />
            </div>

            <div className={s['form-group']}>
  <label className={s['form-label']}>Port</label>
  <input
    className={s['form-input']}
    type="number"
    placeholder="465 or 587"
    value={form.port === '' ? '' : String(form.port)}
    onChange={e => {
      const v = e.target.value;
      onChange('port', v === '' ? '' : Number(v));
    }}
  />
</div>


            <div className={s['form-group']}>
              <label className={s['form-label']}>Encryption</label>
              <small className={s['form-hint']}>
  AUTO picks TLS if port is 465, STARTTLS if 587, otherwise None.
</small>

              <select
                className={s['form-select']}
                value={form.encryption}
                onChange={e => onChange('encryption', e.target.value as any)}
              >
                <option value="AUTO">AUTO (detect by port)</option>
                <option value="STARTTLS">STARTTLS (587)</option>
                <option value="TLS">TLS implicit (465)</option>
                <option value="NONE">None (25)</option>
              </select>

            </div>

            <div className={s['form-group']}>
              <label className={s['form-label']}>SMTP Username</label>
              <input className={s['form-input']} value={form.user} onChange={e => onChange('user', e.target.value)} placeholder="no-reply@example.com" />
            </div>

            <div className={s['form-group']}>
              <label className={s['form-label']}>
                SMTP Password <small>(leave blank to keep current)</small>
              </label>
              <input className={s['form-input']} type="password" value={form.pass} onChange={e => onChange('pass', e.target.value)} placeholder="Enter new password" />
            </div>

            <div className={s['form-group']}>
              <label className={s['form-label']}>From Name</label>
              <input className={s['form-input']} value={form.fromName} onChange={e => onChange('fromName', e.target.value)} placeholder="Extramus IT" />
            </div>

            <div className={s['form-group']}>
              <label className={s['form-label']}>From Email</label>
              <input className={s['form-input']} type="email" value={form.fromEmail} onChange={e => onChange('fromEmail', e.target.value)} placeholder="no-reply@example.com" />
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', marginTop:24 }}>
            <button className={s['save-button']} onClick={save} disabled={saving}>
              <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`} aria-hidden="true" />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>

            {msg && (
              <div className={`${s.message} ${msg.ok ? s.success : s.error}`} role="status">
                {msg.text}
              </div>
            )}
          </div>
        </section>

        <section className={s.card}>
          <h2 className={s['card-title']}>
            <i className="fas fa-paper-plane" aria-hidden="true" />
            Test Email Configuration
          </h2>

          <p className={s['test-description']}>Send a test email to verify your SMTP settings are working correctly.</p>

          <div className={s['form-group']}>
            <label className={s['form-label']}>Recipient Email</label>
            <input className={s['form-input']} type="email" placeholder="you@company.com" value={testTo} onChange={e => setTestTo(e.target.value)} />
          </div>

          <div style={{ display:'flex', alignItems:'center', marginTop:16 }}>
            <button className={s['test-button']} onClick={sendTest} disabled={testing || !testTo}>
              <i className={`fas ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>

            {testMsg && (
              <div className={`${s.message} ${testMsg.ok ? s.success : s.error}`} role="status">
                {testMsg.text}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <PageInner />
    </ProtectedRoute>
  );
}
