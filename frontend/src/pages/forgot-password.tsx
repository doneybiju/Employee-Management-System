// frontend/src/pages/forgot-password.tsx
import { useState, FormEvent } from 'react';
import Link from 'next/link';

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
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>
            <header style={styles.header}>
              <h1 style={styles.h1}>Reset Your Password</h1>
              <p style={styles.sub}>Enter your email to receive a reset link</p>
            </header>
            <section style={styles.body}>
              <div style={{ textAlign: 'center', marginBottom: 20, fontSize: 64, color: '#4caf50' }}>
                {/* check-circle */}
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm-1 14-4-4 1.414-1.414L11 12.172l5.586-5.586L18 8l-7 8Z" />
                </svg>
              </div>
              <div style={{ textAlign: 'center', marginBottom: 30 }}>
                <h2 style={{ margin: '0 0 8px', color: '#2e7d32' }}>Check your email</h2>
                <p>If an account exists with this email, we sent a password reset link.</p>
              </div>
              <Link href="/login" style={styles.backLink}>
                {/* arrow-left */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ marginRight: 8 }}>
                  <path d="M14 7l-5 5 5 5V7z" />
                </svg>
                Back to Login
              </Link>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.card}>
          <header style={styles.header}>
            <h1 style={styles.h1}>Reset Your Password</h1>
            <p style={styles.sub}>Enter your email to receive a reset link</p>
          </header>

          <section style={styles.body}>
            {err && (
              <div style={{ ...styles.alert, ...styles.alertError }}>
                {/* exclamation-circle */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
                </svg>
                <span>{err}</span>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate>
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="email" style={styles.label}>Email Address</label>
                <div style={styles.inputWrap}>
                  {/* envelope */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#888" aria-hidden style={styles.inputIcon}>
                    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z" />
                  </svg>
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.8 : 1 }}>
                {loading ? (
                  <>
                    <span style={styles.spinner} aria-hidden />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>
            </form>

            <Link href="/login" style={styles.backLink}>
              {/* arrow-left */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ marginRight: 8 }}>
                <path d="M14 7l-5 5 5 5V7z" />
              </svg>
              Back to Login
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

/* === styles === */
const styles: Record<string, any> = {
  page: {
    minHeight: '100vh',
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f7f9',
    color: '#333',
  },
  container: { width: '100%', maxWidth: 480 },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #5b67f1 0%, #7b9cff 100%)',
    color: '#fff',
    padding: '30px 30px 25px',
    textAlign: 'center',
  },
  h1: { fontSize: 24, fontWeight: 600, margin: 0, marginBottom: 8 },
  sub: { opacity: 0.9, fontSize: 15, margin: 0 },
  body: { padding: 30 },
  label: { display: 'block', marginBottom: 8, fontWeight: 500, color: '#555', fontSize: 14 },
  inputWrap: { position: 'relative' as const },
  inputIcon: { position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' },
  input: {
    width: '100%',
    padding: '14px 16px 14px 45px',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    fontSize: 15,
    transition: 'all .3s ease',
    backgroundColor: '#fafafa',
    outline: 'none',
  },
  btn: {
    width: '100%',
    padding: 14,
    background: 'linear-gradient(135deg, #5b67f1 0%, #7b9cff 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    transition: 'transform .2s ease, box-shadow .2s ease',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    color: '#666',
    textDecoration: 'none',
    fontSize: 14,
  },
  alert: {
    padding: '12px 16px',
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  alertError: { backgroundColor: '#ffebee', color: '#c62828', borderLeft: '4px solid #c62828' },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid transparent',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};
