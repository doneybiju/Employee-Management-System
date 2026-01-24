import {useState, FormEvent} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import Layout from '@/components/Layout';
import {Lock, Eye, EyeOff, Check, AlertCircle} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function ChangePasswordPage() {
  const router = useRouter();
  const {logout} = useAuth();

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

  // visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const rules = [
    {label: '12+ characters', valid: newPassword.length >= 12},
    {label: 'Uppercase letter', valid: /[A-Z]/.test(newPassword)},
    {label: 'Lowercase letter', valid: /[a-z]/.test(newPassword)},
    {label: 'Number', valid: /\d/.test(newPassword)},
    {label: 'Symbol', valid: /[^A-Za-z0-9]/.test(newPassword)},
    {label: 'No spaces', valid: !/\s/.test(newPassword)},
  ];

  const allRulesPassed = rules.every(r => r.valid);
  const passwordsMatch = newPassword === confirm && confirm.length > 0;
  const valid = allRulesPassed && passwordsMatch;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (!valid) {
      setErr('Please ensure all password rules are met.');
      return;
    }
    setLoading(true);
    try {
      if (isReset) {
        // unauthenticated reset using token
        const res = await fetch(`${API}/api/password/reset`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({token, newPassword}),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Reset failed');
        setOk(true);
        // Delay redirect slightly so user sees success message
        setTimeout(() => router.replace('/login'), 2000);
      } else {
        // authenticated change
        const res = (await fetchWithAuth('/api/auth/change-password', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({currentPassword, newPassword}),
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

  return (
    <Layout hideNav={isReset}>
      <div className="max-w-md mx-auto mt-10 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isReset ? 'Set New Password' : 'Change Password'}
          </h1>
        </div>

        {err && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
          </div>
        )}

        {ok && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <p className="text-sm text-green-600 dark:text-green-400">
              Password updated successfully. Redirecting to login...
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          {!isReset && (
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Current Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-transparent focus:bg-white dark:focus:bg-[#1A1A1A] focus:border-blue-500 focus:ring-2 ring-blue-500/20 rounded-lg transition-all pr-10 outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-transparent focus:bg-white dark:focus:bg-[#1A1A1A] focus:border-blue-500 focus:ring-2 ring-blue-500/20 rounded-lg transition-all pr-10 outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className={`w-full px-4 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border ${
                  confirm && !passwordsMatch
                    ? 'border-red-300 focus:border-red-500 ring-red-500/20'
                    : 'border-transparent focus:border-blue-500 ring-blue-500/20'
                } focus:bg-white dark:focus:bg-[#1A1A1A] focus:ring-2 rounded-lg transition-all pr-10 outline-none`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirm && !passwordsMatch && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                Passwords do not match
              </p>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Password Requirements
            </p>
            <ul className="grid grid-cols-2 gap-2">
              {rules.map((rule, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      rule.valid
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                    }`}
                  >
                    {rule.valid && <Check size={10} strokeWidth={3} />}
                  </div>
                  <span
                    className={
                      rule.valid
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-gray-500 dark:text-gray-500'
                    }
                  >
                    {rule.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading
                ? 'Updating...'
                : isReset
                  ? 'Set Password'
                  : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
