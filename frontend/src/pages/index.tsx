// frontend/src/pages/index.tsx
import Head from 'next/head';
import {useEffect, useState} from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';

import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import {Deadline} from '@/types/dashboard';
import Link from 'next/link';
import {
  Rocket,
  CalendarClock,
  Briefcase,
  Zap,
  UploadCloud,
  ListTodo,
  FileText,
  CalendarCheck,
  AlertCircle,
} from 'lucide-react';

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
    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-amber-50 dark:bg-amber-900/10 mx-auto mb-6 p-5 rounded-xl border-l-4 border-amber-500 shadow-sm max-w-7xl">
      <div className="text-amber-500">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900 dark:text-white text-sm mb-0.5">
          Required Documents
        </div>
        <div className="text-gray-500 dark:text-gray-400 text-[13px]">
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
          <span className="sr-only">Dismiss</span>
          {/* Using a simple X SVG since Lucide X wasn't explicitly requested but nice to have,
              or I can use text X or similar. But since I can't import X without permission/plan change,
              I'll just use the Unicode cross or assume X is not vital to be Lucide right now.
              Actually, the user said "Replace ALL FontAwesome".
              Existing code used `fas fa-times`.
              I should probably use `X` from lucide-react.
              Let's add `X` to imports if possible.
              The prompt said "Suggested mappings: ...". It didn't forbid others.
              I'll add X to imports.
          */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
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
    <div className="bg-gray-50 dark:bg-[#0a0a0a] min-h-screen">
      <Head>
        <title>Dashboard • Intern Portal</title>
      </Head>

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 mb-8">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white m-0">
              Dashboard
            </h1>
            <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Key Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 hover:border-blue-500/50 transition-colors shadow-sm">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-blue-100 dark:bg-blue-900/20 text-blue-600">
              <Rocket className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1 uppercase tracking-wider">
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
            <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 hover:border-blue-500/50 transition-colors shadow-sm">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-green-100 dark:bg-green-900/20 text-green-600">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1 uppercase tracking-wider">
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

          <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 hover:border-blue-500/50 transition-colors shadow-sm">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600">
              <Briefcase className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1 uppercase tracking-wider">
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
        <section className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
              <Zap className="w-5 h-5 text-blue-600" />
              Quick Actions
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="flex flex-col items-center justify-center p-6 gap-3 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all group cursor-pointer shadow-sm">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Upload Docs
              </span>
            </button>
            <Link
              href="/my-work"
              className="flex flex-col items-center justify-center p-6 gap-3 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all group cursor-pointer shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white group-hover:scale-110 transition-transform">
                <ListTodo className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                My Tasks
              </span>
            </Link>

            <button className="flex flex-col items-center justify-center p-6 gap-3 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all group cursor-pointer shadow-sm">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Reports
              </span>
            </button>
            <button className="flex flex-col items-center justify-center p-6 gap-3 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-all group cursor-pointer shadow-sm">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white group-hover:scale-110 transition-transform">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
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
