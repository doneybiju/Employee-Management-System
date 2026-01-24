import Head from 'next/head';
import {useEffect, useState} from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import {
  Server,
  Save,
  Send,
  CheckCircle,
  AlertCircle,
  Lock,
  Globe,
  Mail,
  User,
} from 'lucide-react';

type Form = {
  host: string;
  // allow '' (blank) as well as number
  port: number | '';
  encryption: 'AUTO' | 'NONE' | 'STARTTLS' | 'TLS';
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  hasPassword?: boolean;
};

function PageInner() {
  const {user, loading} = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{text: string; ok: boolean} | null>(null);

  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{text: string; ok: boolean} | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/api/admin/smtp');
      const cfg = await res.json();
      setForm({
        host: cfg?.host ?? '',
        port: cfg?.port && Number(cfg.port) > 0 ? Number(cfg.port) : '', // blank if 0/undefined
        encryption: (['NONE', 'STARTTLS', 'TLS', 'AUTO'].includes(
          cfg?.encryption,
        )
          ? cfg.encryption
          : 'AUTO') as Form['encryption'],
        user: cfg?.user ?? '',
        pass: '',
        fromName: cfg?.fromName ?? '',
        fromEmail: cfg?.fromEmail ?? '',
        hasPassword: !!cfg?.hasPassword,
      });
    })();
  }, []);

  if (loading || !form)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  if (!user || user.role !== 'super_admin')
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        Access Denied
      </div>
    );

  const onChange = (k: keyof Form, v: any) => setForm({...form, [k]: v});

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    const resolveEnc = (
      enc: Form['encryption'],
      port: number | '',
    ): 'NONE' | 'STARTTLS' | 'TLS' => {
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
      if (form.pass) body.pass = form.pass;

      const res = await fetchWithAuth('/api/admin/smtp', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setMsg({text: 'Settings saved successfully', ok: true});
      setForm(f => (f ? {...f, pass: '', hasPassword: true} : f));
    } catch (e: any) {
      setMsg({text: e?.message || 'Save failed', ok: false});
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetchWithAuth('/api/admin/smtp/test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({to: testTo}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setTestMsg({text: 'Test email sent successfully', ok: true});
    } catch (e: any) {
      setTestMsg({text: e?.message || 'Test failed', ok: false});
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <Head>
        <title>SMTP Settings | Admin</title>
      </Head>

      <main className="max-w-4xl mx-auto p-6 font-sans my-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
            SMTP Settings
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Configure your email server settings for system notifications
          </p>
        </div>

        <div className="space-y-8">
          {/* SMTP Config Card */}
          <section className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Server className="text-blue-600 dark:text-blue-400" size={20} />
              SMTP Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Host
                </label>
                <div className="relative">
                  <Globe
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={form.host}
                    onChange={e => onChange('host', e.target.value)}
                    placeholder="smtp.example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Port
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  type="number"
                  placeholder="465 or 587"
                  value={form.port === '' ? '' : String(form.port)}
                  onChange={e => {
                    const v = e.target.value;
                    onChange('port', v === '' ? '' : Number(v));
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Encryption
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                    value={form.encryption}
                    onChange={e =>
                      onChange('encryption', e.target.value as any)
                    }
                  >
                    <option value="AUTO">AUTO (detect by port)</option>
                    <option value="STARTTLS">STARTTLS (587)</option>
                    <option value="TLS">TLS implicit (465)</option>
                    <option value="NONE">None (25)</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  AUTO picks TLS if port is 465, STARTTLS if 587.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={form.user}
                    onChange={e => onChange('user', e.target.value)}
                    placeholder="no-reply@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password{' '}
                  <span className="text-xs text-gray-500 font-normal">
                    (leave blank to keep current)
                  </span>
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  type="password"
                  value={form.pass}
                  onChange={e => onChange('pass', e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  From Name
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={form.fromName}
                  onChange={e => onChange('fromName', e.target.value)}
                  placeholder="Extramus IT"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  From Email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    type="email"
                    value={form.fromEmail}
                    onChange={e => onChange('fromEmail', e.target.value)}
                    placeholder="no-reply@example.com"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Save size={18} className={saving ? 'animate-spin' : ''} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>

              {msg && (
                <div
                  className={`flex items-center gap-2 text-sm font-medium ${
                    msg.ok
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {msg.ok ? (
                    <CheckCircle size={18} />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                  {msg.text}
                </div>
              )}
            </div>
          </section>

          {/* Test Email Card */}
          <section className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Send className="text-blue-600 dark:text-blue-400" size={20} />
              Test Email Configuration
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Send a test email to verify your SMTP settings are working
              correctly.
            </p>

            <div className="flex items-start gap-4">
              <div className="flex-1 max-w-md">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Recipient Email
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  type="email"
                  placeholder="you@company.com"
                  value={testTo}
                  onChange={e => setTestTo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <button
                onClick={sendTest}
                disabled={testing || !testTo}
                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Send size={18} className={testing ? 'animate-pulse' : ''} />
                {testing ? 'Sending...' : 'Send Test Email'}
              </button>

              {testMsg && (
                <div
                  className={`flex items-center gap-2 text-sm font-medium ${
                    testMsg.ok
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {testMsg.ok ? (
                    <CheckCircle size={18} />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                  {testMsg.text}
                </div>
              )}
            </div>
          </section>
        </div>
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
