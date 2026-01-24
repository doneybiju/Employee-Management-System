// frontend/src/pages/login.tsx

import {useEffect, useState, FormEvent} from 'react';
import {useRouter} from 'next/router';
import {useAuth} from '@/context/AuthContext';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const {login, isAuthenticated, ready} = useAuth();
  const [showPw, setShowPw] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // --- device hint helpers ---
  function getDeviceId() {
    try {
      const key = 'deviceId';
      let id = localStorage.getItem(key);
      if (!id) {
        // use secure UUID if available
        const rnd =
          (crypto as any)?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        id = `web-${rnd}`;
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      return undefined;
    }
  }

  function buildHints() {
    return {
      deviceId: getDeviceId(),
      tzOffset: new Date().getTimezoneOffset(),
      language:
        typeof navigator !== 'undefined' ? navigator.language : undefined,
      screen:
        typeof window !== 'undefined' && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : undefined,
      platform:
        typeof navigator !== 'undefined' ? navigator.platform : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      // fpHash: 'optional-fingerprint-hash', // add if you implement one
    };
  }

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) router.replace('/');
  }, [ready, isAuthenticated, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password, buildHints()); // ⬅ pass hints
      // redirect happens in AuthContext
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  // simple inline SVG icons
  const MailIcon = () => (
    <svg
      className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11Zm2.4-.5 7.6 5 7.6-5H4.4Zm15.6 2.3-7.2 4.8a1.5 1.5 0 0 1-1.6 0L4 8.3V17.5c0 .28.22.5.5.5h15c.28 0 .5-.22.5-.5V8.3Z" />
    </svg>
  );
  const LockIcon = () => (
    <svg
      className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 10V7a5 5 0 1 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z" />
    </svg>
  );

  return (
    <main className="min-h-[100dvh] grid place-items-center p-6 bg-gradient-to-br from-[#eef2f7] to-[#f7f9fc] overflow-hidden">
      <section className="w-full max-w-[420px] p-8 md:p-7 bg-white/96 rounded-[18px] shadow-[0_14px_32px_rgba(0,0,0,0.14)] backdrop-blur-[6px] box-border">
        <header className="text-center mb-[22px]">
          <h1 className="text-[26px] font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1.5 text-gray-500 text-sm">Sign in to continue</p>
        </header>

        {err && (
          <div className="bg-red-50 text-red-700 border border-red-200 p-2.5 rounded-[10px] text-sm mb-[14px]">
            {err}
          </div>
        )}

        <form className="flex flex-col" onSubmit={onSubmit} noValidate>
          <div className="relative mb-4">
            <MailIcon />
            <input
              className="w-full border-none outline-none bg-gray-100 text-gray-900 py-[14px] px-[14px] pl-[44px] rounded-xl text-[15px] transition-all focus:bg-[#eef1f5] focus:ring-2 focus:ring-blue-500/25"
              type="email"
              placeholder="Company email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="relative mb-4">
            <LockIcon />
            <input
              className="w-full border-none outline-none bg-gray-100 text-gray-900 py-[14px] px-[14px] pl-[44px] rounded-xl text-[15px] transition-all focus:bg-[#eef1f5] focus:ring-2 focus:ring-blue-500/25"
              type={showPw ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent p-1.5 cursor-pointer text-gray-500"
            >
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>

          <Link
            href="/forgot-password"
            className="inline-block ml-auto mb-[18px] text-blue-600 text-sm hover:underline"
          >
            Forgot password?
          </Link>

          <button
            className="w-full p-[14px] border-none rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-semibold cursor-pointer shadow-[0_6px_14px_rgba(79,70,229,0.35)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(79,70,229,0.45)] disabled:opacity-60 disabled:cursor-not-allowed"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="flex items-center gap-3 my-5 text-gray-400 text-[13px] before:flex-1 before:h-px before:bg-gray-200 after:flex-1 after:h-px after:bg-gray-200">
            <span>or</span>
          </div>

          <button
            type="button"
            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium cursor-pointer flex items-center justify-center gap-3 hover:bg-gray-50"
            onClick={() => {
              window.location.href = '/api/auth/google';
            }}
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google logo"
              width={20}
              height={20}
            />
            Continue with Google
          </button>

          <div className="text-center mt-4 text-gray-500 text-sm">
            Need access? Contact IT.
          </div>
        </form>
      </section>
    </main>
  );
}
