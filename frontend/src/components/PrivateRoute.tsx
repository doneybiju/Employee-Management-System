// frontend/src/components/PrivateRoute.tsx
import {useEffect} from 'react';
import {useRouter} from 'next/router';
import {useAuth} from '@/context/AuthContext';

export default function PrivateRoute({children}: {children: React.ReactNode}) {
  const {isAuthenticated, ready, mustChangePassword} = useAuth();
  const router = useRouter();

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

  if (!ready) return null;
  if (!isAuthenticated) return null;
  if (mustChangePassword && router.pathname !== '/change-password') return null;

  return <>{children}</>;
}
