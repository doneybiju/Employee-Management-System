import React from 'react';
import Navigation from './Navigation';
import DocsReminderToast from './DocsReminderToast';
import {useAuth} from '@/context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
}

export default function Layout({children, hideNav = false}: LayoutProps) {
  const {isAuthenticated, ready, mustChangePassword} = useAuth();

  if (hideNav) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
        {children}
      </main>
    );
  }

  return (
    <>
      <Navigation />
      {/*
        Replicating .content style from globals.css:
        padding: 30px (approx p-8)
        min-height: 100vh
        background: var(--background) -> bg-gray-50 / dark
        margin-left: 0 (default)
      */}
      <main
        className={`min-h-screen p-8 bg-gray-50 dark:bg-[#0a0a0a] transition-all duration-300 ${
          !mustChangePassword ? 'md:ml-64' : ''
        }`}
      >
        {children}
      </main>
      {ready && isAuthenticated ? <DocsReminderToast /> : null}
    </>
  );
}
