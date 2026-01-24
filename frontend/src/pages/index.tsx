// frontend/src/pages/index.tsx
import Head from 'next/head';
import {useEffect, useState} from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';

import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import {Deadline} from '@/types/dashboard';
import Link from 'next/link';

type MeStats = {
  status: 'Active' | 'Inactive' | null;
  startDate: string | null;
  endDate: string | null;
  department: string | null;
  position: string | null;
  daysRemaining: number | null;
};

function useMissingDocsNotice() {
  const [missing, setMissing] = useState<string[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/reminders/me', {
          cache: 'no-store' as RequestCache,
        });
        const j = await res.json().catch(() => ({missing: []}));
        const list = Array.isArray(j?.missing) ? j.missing : [];
        setMissing(list);
        const until = Number(localStorage.getItem('doc_notice_until') || 0);
        setShow(list.length > 0 && Date.now() > until);
      } catch {
        setShow(false);
      }
    })();
  }, []);

  function remindLater() {
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem('doc_notice_until', String(Date.now() + day));
    setShow(false);
  }

  function dismiss() {
    setShow(false);
  }

  return {missing, show, remindLater, dismiss};
}

function ModernNotification({
  missing,
  onLater,
  onDismiss,
}: {
  missing: string[];
  onLater: () => void;
  onDismiss: () => void;
}) {
  if (missing.length === 0) return null;

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-white dark:bg-gray-800 mx-auto mb-6 p-5 rounded-xl border border-yellow-500 shadow-sm max-w-[1400px]">
      <div className="text-yellow-500 text-xl">
        <i className="fas fa-exclamation-circle" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900 dark:text-white text-sm mb-0.5">
          Required Documents
        </div>
        <div className="text-gray-500 text-[13px]">
          Upload {missing.join(', ')} to complete your profile
        </div>
      </div>
      <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded text-[13px] font-medium hover:bg-blue-700 transition-colors shadow-sm"
          onClick={() => (window.location.href = '/profile')}
        >
          Upload Now
        </button>
        <button
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded text-[13px] font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
          onClick={onLater}
        >
          Later
        </button>
        <button
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          onClick={onDismiss}
        >
          <i className="fas fa-times" />
        </button>
      </div>
    </div>
  );
}

function IndexInner() {
  const notice = useMissingDocsNotice();
  const {user, loading} = useAuth();
  const [me, setMe] = useState<MeStats | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithAuth('/api/stats/deadlines', {
          cache: 'no-store' as RequestCache,
        });
        const j = await r.json();
        setDeadlines(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setDeadlines([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/stats/me');
        const j = await res.json();
        setMe(j ?? null);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  const getStatusVariant = (status: string) => {
    return status === 'Active' ? 'text-green-600' : 'text-yellow-600';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-gray-500">Preparing your dashboard...</p>
      </div>
    );
  }

  const hasEndDate = !!me?.endDate;

  return (
    <div className="">
      <Head>
        <title>Dashboard • Intern Portal</title>
      </Head>

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 mb-8 -mx-8 -mt-8">
        <div className="flex justify-between items-center max-w-[1400px] mx-auto">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white m-0">
              Dashboard
            </h1>
            <div className="text-gray-500 text-sm font-medium">
              Welcome back, {user?.firstName || 'Intern'}! 👋
            </div>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      {notice.show && (
        <ModernNotification
          missing={notice.missing}
          onLater={notice.remindLater}
          onDismiss={notice.dismiss}
        />
      )}

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto">
        {/* Key Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:-translate-y-0.5 transition-transform shadow-sm hover:shadow-md">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-blue-100 text-blue-600">
              <i className="fas fa-rocket"></i>
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                Status
              </div>
              <div
                className={`text-2xl font-bold mb-1 ${getStatusVariant(me?.status || '')}`}
              >
                {me?.status || '—'}
              </div>
              <div className="text-xs text-gray-400">
                Since{' '}
                {me?.startDate
                  ? new Date(me.startDate).toLocaleDateString()
                  : '—'}
              </div>
            </div>
          </div>

          {hasEndDate && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:-translate-y-0.5 transition-transform shadow-sm hover:shadow-md">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-green-100 text-green-600">
                <i className="fas fa-calendar"></i>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                  Timeline
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {me?.daysRemaining ?? '—'} days
                </div>
                <div className="text-xs text-gray-400">
                  Ends {new Date(me!.endDate as string).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 hover:-translate-y-0.5 transition-transform shadow-sm hover:shadow-md">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-yellow-100 text-yellow-600">
              <i className="fas fa-briefcase"></i>
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                Position
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {me?.position || '—'}
              </div>
              <div className="text-xs text-gray-400">
                {me?.department || '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Deadlines Section */}
        <UpcomingDeadlines deadlines={deadlines} />

        {/* Quick Actions */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
              <i className="fas fa-bolt text-blue-600"></i>
              Quick Actions
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                <i className="fas fa-upload"></i>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                Upload Docs
              </span>
            </button>
            <Link
              href="/my-work"
              className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                <i className="fas fa-tasks"></i>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                My Tasks
              </span>
            </Link>

            <button className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                <i className="fas fa-file-alt"></i>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                Reports
              </span>
            </button>
            <button className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                <i className="fas fa-calendar-check"></i>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                Schedule
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <IndexInner />
    </ProtectedRoute>
  );
}
