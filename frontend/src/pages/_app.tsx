// frontend/src/pages/_app.tsx
import type {AppProps} from 'next/app';
import {useRouter} from 'next/router';
import Navigation from '@/components/Navigation';
import {AuthProvider, useAuth} from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import '../styles/globals.css';
import '@styles/profile.css';
import DocsReminderToast from '@/components/DocsReminderToast';
import '../styles/dashboard.css';

export default function App({Component, pageProps}: AppProps) {
  return (
    <AuthProvider>
      <AppShell Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}

function AppShell({Component, pageProps}: {Component: any; pageProps: any}) {
  const router = useRouter();
  const {mustChangePassword, isAuthenticated, ready} = useAuth();

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

  return hideNav ? (
    content
  ) : (
    <>
      <Navigation />
      <main className="content">{content}</main>
      {ready && isAuthenticated ? <DocsReminderToast /> : null}
    </>
  );
}
