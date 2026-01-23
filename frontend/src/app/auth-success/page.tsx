'use client';

import {useEffect, Suspense} from 'react';
import {useSearchParams} from 'next/navigation';

function AuthSuccessContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams?.get('token');
    if (token) {
      localStorage.setItem('token', token);
      // Force reload/redirect to root to ensure Pages Router context picks it up
      window.location.href = '/';
    } else {
      window.location.href = '/login?error=no_token';
    }
  }, [searchParams]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}
    >
      <p>Authenticating...</p>
    </div>
  );
}

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthSuccessContent />
    </Suspense>
  );
}
