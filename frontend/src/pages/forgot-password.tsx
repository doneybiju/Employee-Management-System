import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { KeyRound, Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('user@example.com');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const v = email.trim().toLowerCase();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    if (!ok) {
      setErr('Enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await fetch(`${API}/api/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v }),
      });
      setDone(true); // always show success
    } catch (e: any) {
      setErr(e?.message || 'Failed to send reset link. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Check your email
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            If an account exists with this email, we sent a password reset link.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-8">

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
            <KeyRound className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center">
            Reset Your Password
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
            Enter your email to receive a reset link
          </p>
        </div>

        {/* Error Alert */}
        {err && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-2.5 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <span>Send Reset Link</span>
            )}
          </button>
        </form>

        <div className="mt-6 flex justify-center">
          <Link
            href="/login"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
