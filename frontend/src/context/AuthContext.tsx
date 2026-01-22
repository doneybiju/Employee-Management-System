// frontend/src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {useRouter} from 'next/router';

type Role = 'intern' | 'hr' | 'super_admin';
type EmpType = 'intern' | 'employee' | 'team_lead';

type LoginHints = {
  deviceId?: string;
  fpHash?: string;
  tzOffset?: number;
  language?: string;
  screen?: string;
  platform?: string;
  userAgent?: string;
};

export type User = {
  id?: string;
  role: Role;
  email?: string;
  firstName?: string;
  surname?: string;
  empType?: EmpType;
};

type AuthCtx = {
  token: string | null;
  isAuthenticated: boolean;
  ready: boolean;
  loading: boolean;
  user: User | null;
  mustChangePassword: boolean;
  login: (email: string, password: string, hints?: LoginHints) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx>({
  token: null,
  isAuthenticated: false,
  ready: false,
  loading: true,
  user: null,
  mustChangePassword: false,
  login: async () => {},
  logout: () => {},
});

function decode(token: string): any | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({children}) => {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mustChange, setMustChange] = useState(false);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const scheduleLogoutFromToken = (tok: string) => {
    clearTimer();
    const p = decode(tok);
    const exp = typeof p?.exp === 'number' ? p.exp * 1000 : null;
    if (!exp) return;
    const ms = exp - Date.now();
    if (ms <= 0) {
      logout();
      return;
    }
    timerRef.current = setTimeout(logout, ms);
    if (typeof window !== 'undefined')
      localStorage.setItem('token_exp', String(p.exp));
  };

  const syncFromStorage = () => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('token');
    if (!t) {
      if (token) logout();
      return;
    }

    if (t !== token) {
      setToken(t);
      const p = decode(t);
      setUser({
        id: String(p?.sub ?? ''),
        role: (p?.role as Role) ?? 'intern',
        email: p?.email,
        firstName: p?.firstName,
        surname: p?.surname,
        empType: p?.empType as EmpType | undefined,
      });
      scheduleLogoutFromToken(t);
      return;
    }

    const p = decode(t);
    if (!p?.exp || p.exp * 1000 <= Date.now()) logout();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('token');
    if (t) {
      const p = decode(t);
      if (p?.exp && p.exp * 1000 > Date.now()) {
        setToken(t);
        setUser({
          id: String(p.sub ?? ''),
          role: (p.role as Role) ?? 'intern',
          email: p.email,
          firstName: p.firstName,
          surname: p.surname,
          empType: p?.empType as EmpType | undefined,
        });
        scheduleLogoutFromToken(t);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('token_exp');
      }
    }
    setMustChange(localStorage.getItem('must_change_password') === '1');
    setReady(true);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) scheduleLogoutFromToken(token);
  }, [token]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'token_exp') syncFromStorage();
    };
    const onUnauthorized = () => logout();
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncFromStorage();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('app:unauthorized', onUnauthorized as any);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('app:unauthorized', onUnauthorized as any);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login(email: string, password: string, hints?: LoginHints) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (hints?.deviceId) headers['X-Device-Id'] = hints.deviceId;
    if (hints?.fpHash) headers['X-Fp-Hash'] = hints.fpHash;
    if (typeof hints?.tzOffset === 'number')
      headers['X-Tz-Offset'] = String(hints.tzOffset);
    if (hints?.language) headers['X-Accept-Language'] = hints.language;
    if (hints?.screen) headers['X-Screen'] = hints.screen;
    if (hints?.platform) headers['X-Platform'] = hints.platform;

    const body = {
      email: email.trim().toLowerCase(),
      password,
      userAgent: hints?.userAgent,
      deviceId: hints?.deviceId,
      fpHash: hints?.fpHash,
      tzOffset: hints?.tzOffset,
      language: hints?.language,
      screen: hints?.screen,
      platform: hints?.platform,
    };

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let data: any = null;
      try {
        data = await res.json();
      } catch {}
      const limit = data?.limit ?? 3;
      const remaining = data?.remainingAttempts;

      if (res.status === 429 || data?.error === 'TOO_MANY_LOGIN_ATTEMPTS') {
        const secs = Number(data?.retryAfterSeconds ?? 900);
        const mins = Math.max(1, Math.round(secs / 60));
        throw new Error(
          `Too many failed attempts. Account temporarily blocked. Try again in ~${mins} minute(s) or contact the IT Department.`,
        );
      }

      if (res.status === 401) {
        const base = data?.message || 'Invalid credentials.';
        const suffix =
          typeof remaining === 'number'
            ? ` Attempts remaining: ${remaining}/${limit}.`
            : '';
        throw new Error(base + suffix);
      }

      throw new Error(data?.error || data?.message || 'Login failed');
    }

    const {token: tok, mustChangePassword} = await res.json();
    if (!tok) throw new Error('No token returned');

    localStorage.setItem('token', tok);
    localStorage.setItem(
      'must_change_password',
      mustChangePassword ? '1' : '0',
    );

    setToken(tok);
    setMustChange(!!mustChangePassword);

    const p = decode(tok) as any;
    const role: Role = (p?.role as Role) ?? 'intern';

    setUser({
      id: String(p?.sub ?? ''),
      role,
      email: p?.email,
      firstName: p?.firstName,
      surname: p?.surname,
      empType: p?.empType as EmpType | undefined,
    });

    scheduleLogoutFromToken(tok);

    if (mustChangePassword) {
      router.replace('/change-password');
      return;
    }
    router.replace(role === 'hr' || role === 'super_admin' ? '/admin' : '/');
  }

  function logout() {
    clearTimer();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('token_exp');
      localStorage.removeItem('must_change_password');
    }
    setToken(null);
    setUser(null);
    setMustChange(false);
    if (router.pathname !== '/login') router.replace('/login');
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        ready,
        loading: !ready,
        user,
        mustChangePassword: mustChange,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
