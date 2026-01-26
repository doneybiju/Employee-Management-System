// frontend/src/pages/login.tsx

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import styles from './login.module.css';
import Link from 'next/link';
import LoginButton from '@/components/LoginButton';

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
        const rnd = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
      language: typeof navigator !== 'undefined' ? navigator.language : undefined,
      screen:
        typeof window !== 'undefined' && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : undefined,
      platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
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
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11Zm2.4-.5 7.6 5 7.6-5H4.4Zm15.6 2.3-7.2 4.8a1.5 1.5 0 0 1-1.6 0L4 8.3V17.5c0 .28.22.5.5.5h15c.28 0 .5-.22.5-.5V8.3Z"/>
    </svg>
  );
  const LockIcon = () => (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 10V7a5 5 0 1 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z"/>
    </svg>
  );

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.sub}>Sign in to continue</p>
        </header>

        {err && <div className={styles.error}>{err}</div>}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.group}>
            <MailIcon />
            <input
              className={styles.input}
              type="email"
              placeholder="Company email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.group} style={{ position: 'relative' }}>
            <LockIcon />
            <input
              className={styles.input}
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
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                padding: 6,
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>

          <Link href="/forgot-password" className={styles.link}>Forgot password?</Link>

          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className={styles.divider}><span>or</span></div>

          <LoginButton />

          <div className={styles.footer}>
            Need access? Contact IT.
          </div>
        </form>
      </section>
    </main>
  );
}
