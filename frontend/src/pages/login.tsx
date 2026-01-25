import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Hexagon, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, ready } = useAuth();
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
      await login(email.trim().toLowerCase(), password, buildHints());
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-8">

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center mb-4">
            <Hexagon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Welcome back! Please enter your details.
          </p>
        </div>

        {/* Error Alert */}
        {err && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {err}
          </div>
        )}

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-2.5 w-5 h-5 text-gray-400" />
              <input
                id="email"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-2.5 w-5 h-5 text-gray-400" />
              <input
                id="password"
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex justify-end mt-2">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-[#111] text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Google Button */}
        <button
          type="button"
          onClick={() => {
            window.location.href = '/api/auth/google';
          }}
          className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-[#111] hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors text-gray-700 dark:text-gray-200 font-medium"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google logo"
            width={20}
            height={20}
          />
          Google
        </button>

        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Need access?{' '}
          <a href="#" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400">
            Contact IT Support
          </a>
        </p>
      </div>
    </main>
  );
}
