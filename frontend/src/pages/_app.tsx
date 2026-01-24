import type {AppProps} from 'next/app';
import {useRouter} from 'next/router';
import {AuthProvider, useAuth} from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import '../styles/globals.css';

export default function App({Component, pageProps}: AppProps) {
  return (
    <AuthProvider>
      <AppShell Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}

function AppShell({Component, pageProps}: {Component: any; pageProps: any}) {
  const router = useRouter();
  const {mustChangePassword} = useAuth();

  const path = router.pathname;
  const isAuthPage = [
    '/login',
    '/change-password',
    '/forgot-password',
  ].includes(path);
  const needsGuard = !isAuthPage;
  const hideNav = isAuthPage || mustChangePassword;

  const content = needsGuard ? (
    <ProtectedRoute>
      <Component {...pageProps} />
    </ProtectedRoute>
  ) : (
    <Component {...pageProps} />
  );

  return <Layout hideNav={hideNav}>{content}</Layout>;
}
