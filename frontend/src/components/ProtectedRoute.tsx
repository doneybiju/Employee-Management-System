// frontend/src/components/ProtectedRoute.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';

type AllowedRole = 'intern' | 'hr' | 'super_admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional: restrict this page to specific roles */
  roles?: AllowedRole[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, ready, mustChangePassword, user, loading } = useAuth();
  const router = useRouter();

  // 1) Basic auth + password-change gate (unchanged)
  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (mustChangePassword && router.pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [ready, isAuthenticated, mustChangePassword, router]);

  // 2) Role-based landing: HR / Super Admin should live at /admin when on '/'
  useEffect(() => {
    if (!ready || loading || !user) return;

    if (
      (user.role === 'hr' || user.role === 'super_admin') &&
      router.pathname === '/'
    ) {
      router.replace('/admin');
    }
  }, [ready, loading, user, router]);

  // 3) Optional: enforce allowed roles when `roles` prop is provided
  useEffect(() => {
    if (!ready || loading) return;
    if (!roles || roles.length === 0) return; // no role restriction on this page
    if (!user) return;

    const allowed = roles.includes(user.role as AllowedRole);
    if (!allowed) {
      router.replace('/unauthorized');
    }
  }, [ready, loading, roles, user, router]);

  // ---- Render guards ----
  if (!ready) return null;
  if (!isAuthenticated) return null;

  if (mustChangePassword && router.pathname !== '/change-password') {
    return null;
  }

  // If roles are specified and user is loaded but not allowed, don't flash the page
  if (roles && roles.length > 0 && user && !roles.includes(user.role as AllowedRole)) {
    return null;
  }

  return <>{children}</>;
}
