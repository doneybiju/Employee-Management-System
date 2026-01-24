// frontend/src/pages/admin/index.tsx
import Link from 'next/link';
import Head from 'next/head';
import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import {fetchWithAuth} from '@/lib/api';

import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import {Deadline} from '@/types/dashboard';

type Role = 'intern' | 'hr' | 'super_admin';

type MeSummary = {
  status: 'active' | 'inactive' | null;
  startDate: string | null;
  endDate: string | null;
  department: string | null;
  position: string | null;
  daysLeft: number | null;
};

type PeopleStats = {interns: number; employees: number; teamLeads: number};

function AdminHome() {
  const {user, loading} = useAuth();
  const role = (user?.role ?? 'intern') as Role;
  const [missingDocs, setMissingDocs] = useState<{
    count: number;
    total: number;
    percent: number;
  } | null>(null);

  // Which tabs are allowed for this user?
  const tabs = useMemo<string[]>(() => {
    if (role === 'super_admin') return ['intern', 'super_admin'];
    if (role === 'hr') return ['intern', 'hr'];
    return [];
  }, [role]);

  const [activeTab, setActiveTab] = useState<string>('');
  useEffect(() => {
    if (tabs.length && !activeTab) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // Data
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [people, setPeople] = useState<PeopleStats | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  // Fetch intern summary for the *logged-in* user (HR/Super Admin can also be interns)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/stats/me');
        const d = await res.json();
        const s: MeSummary = {
          status: d?.status
            ? (String(d.status).toLowerCase() as MeSummary['status'])
            : null,
          startDate: d?.startDate ? new Date(d.startDate).toISOString() : null,
          endDate: d?.endDate ? new Date(d.endDate).toISOString() : null,
          department: d?.department ?? null,
          position: d?.position ?? null,
          daysLeft:
            typeof d?.daysRemaining === 'number' ? d.daysRemaining : null,
        };
        setSummary(s);
      } catch {
        setSummary(null);
      }
    })();
  }, [user]);

  // Fetch HR stats if the user can see HR or Super Admin dashboards
  useEffect(() => {
    if (!user) return;
    if (role !== 'hr' && role !== 'super_admin') return;

    (async () => {
      try {
        const res = await fetchWithAuth('/api/stats/admin/summary', {
          cache: 'no-store' as RequestCache,
        });
        const d = await res.json();

        setPeople({
          interns: Number(d?.activeInterns ?? 0),
          employees: Number(d?.activeEmployees ?? 0),
          teamLeads: Number(d?.activeTeamLeads ?? 0),
        });

        setMissingDocs({
          count: Number(d?.missingDocs?.count ?? 0),
          total: Number(d?.missingDocs?.total ?? 0),
          percent: Number(d?.missingDocs?.percent ?? 0),
        });
      } catch {
        setPeople({interns: 0, employees: 0, teamLeads: 0});
        setMissingDocs({count: 0, total: 0, percent: 0});
      }
    })();
  }, [user, role]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-500">Preparing your dashboard...</p>
      </div>
    );
  }

  if (!user)
    return (
      <main className="p-6">
        <Link href="/login" className="text-blue-600 hover:underline">
          Login
        </Link>{' '}
        required.
      </main>
    );
  if (role !== 'hr' && role !== 'super_admin') {
    return <main className="p-6">Forbidden.</main>;
  }

  const displayName = user.firstName
    ? `${user.firstName} ${user.surname ?? ''}`.trim()
    : (user.email ?? 'User');
  const displayedDeadlines = showAllDeadlines
    ? deadlines
    : deadlines.slice(0, 3);

  const getStatusVariant = (status: string) => {
    return status === 'active' ? 'text-green-600' : 'text-yellow-600';
  };

  const hasEndDate = !!summary?.endDate;

  // Percent shares shown in the Super Admin "People Statistics" block
  const peopleTotal =
    (people?.interns ?? 0) +
    (people?.employees ?? 0) +
    (people?.teamLeads ?? 0);
  const sharePct = (n: number) =>
    peopleTotal ? Math.round((n * 100) / peopleTotal) : 0;

  return (
    <div className="">
      <Head>
        <title>Admin Dashboard • Intern Portal</title>
      </Head>

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 mb-8 -mx-8 -mt-8">
        <div className="flex justify-between items-center max-w-[1400px] mx-auto">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white m-0">
              Admin Dashboard
            </h1>
            <div className="text-gray-500 text-sm font-medium">
              Welcome back, {displayName}! 👋
            </div>
          </div>
        </div>
      </header>

      {/* Role Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-8 -mx-8">
        <div className="flex max-w-[1400px] mx-auto px-8 gap-1">
          {/* Intern Tab - Show for both HR and Super Admin */}
          {tabs.includes('intern') && (
            <button
              className={`flex items-center gap-2 px-6 py-4 bg-transparent border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'intern'
                  ? 'text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('intern')}
            >
              <i className="fas fa-user-graduate"></i>
              Dashboard
            </button>
          )}

          {/* HR Tab - Only show for HR role */}
          {tabs.includes('hr') && (
            <button
              className={`flex items-center gap-2 px-6 py-4 bg-transparent border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'hr'
                  ? 'text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('hr')}
            >
              <i className="fas fa-users"></i>
              HR Dashboard
            </button>
          )}

          {/* Super Admin Tab - Only show for Super Admin role */}
          {tabs.includes('super_admin') && (
            <button
              className={`flex items-center gap-2 px-6 py-4 bg-transparent border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'super_admin'
                  ? 'text-blue-600 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('super_admin')}
            >
              <i className="fas fa-shield-alt"></i>
              Super Admin
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto">
        {/* Intern Dashboard Tab - Show for both HR and Super Admin */}
        {activeTab === 'intern' && (
          <div className="block">
            {/* Key Metrics Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-blue-100 text-blue-600">
                  <i className="fas fa-rocket"></i>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                    Status
                  </div>
                  <div
                    className={`text-2xl font-bold mb-1 ${getStatusVariant(summary?.status || '')}`}
                  >
                    {(summary?.status || '—').toString().replace('_', ' ')}
                  </div>
                  <div className="text-xs text-gray-400">
                    Since{' '}
                    {summary?.startDate
                      ? new Date(summary.startDate).toLocaleDateString()
                      : '—'}
                  </div>
                </div>
              </div>

              {hasEndDate && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-green-100 text-green-600">
                    <i className="fas fa-calendar"></i>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                      Timeline
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                      {summary?.daysLeft ?? '—'} days
                    </div>
                    <div className="text-xs text-gray-400">
                      Ends{' '}
                      {new Date(
                        summary!.endDate as string,
                      ).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-yellow-100 text-yellow-600">
                  <i className="fas fa-briefcase"></i>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                    Position
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {summary?.position || '—'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {summary?.department || '—'}
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
          </div>
        )}

        {/* HR Dashboard Tab - Only for HR role */}
        {activeTab === 'hr' && (
          <div className="block">
            <div className="flex justify-between items-center mb-5">
              <h2 className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
                <i className="fas fa-users text-blue-600"></i>
                HR Overview
              </h2>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
              {[
                {
                  label: 'Active Interns',
                  value: people?.interns ?? 0,
                  desc: 'Currently active',
                  color: 'text-blue-600',
                  bg: 'bg-blue-100',
                  icon: 'fa-user-graduate',
                },
                {
                  label: 'Active Employees',
                  value: people?.employees ?? 0,
                  desc: 'Full-time staff',
                  color: 'text-green-600',
                  bg: 'bg-green-100',
                  icon: 'fa-briefcase',
                },
                {
                  label: 'Team Leads',
                  value: people?.teamLeads ?? 0,
                  desc: 'Managing teams',
                  color: 'text-yellow-600',
                  bg: 'bg-yellow-100',
                  icon: 'fa-user-tie',
                },
                {
                  label: 'Document Alerts',
                  value: missingDocs?.count ?? 0,
                  desc: missingDocs
                    ? `${missingDocs.count} of ${missingDocs.total} missing docs (${missingDocs.percent}%)`
                    : 'Missing documents',
                  color: 'text-red-600',
                  bg: 'bg-red-100',
                  icon: 'fa-exclamation-circle',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 shadow-sm hover:-translate-y-0.5 transition-transform"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${item.bg} ${item.color}`}
                  >
                    <i className={`fas ${item.icon}`}></i>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                      {item.label}
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                      {item.value}
                    </div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </section>

            {/* Quick Actions for HR */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 shadow-sm">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
                  <i className="fas fa-bolt text-blue-600"></i>
                  Quick Actions
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link
                  href="/admin/interns"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                    <i className="fas fa-user-graduate"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    Manage Interns
                  </span>
                </Link>
                <Link
                  href="/admin/documents"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-red-500 text-white">
                    <i className="fas fa-file-contract"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    Document Review
                  </span>
                </Link>
                <Link
                  href="/admin/analytics"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-emerald-500 text-white">
                    <i className="fas fa-chart-bar"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    Analytics
                  </span>
                </Link>
              </div>
            </section>
          </div>
        )}

        {/* Super Admin Dashboard Tab - Only for Super Admin role */}
        {activeTab === 'super_admin' && (
          <div className="block">
            <div className="flex justify-between items-center mb-5">
              <h2 className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
                <i className="fas fa-shield-alt text-blue-600"></i>
                System Overview
              </h2>
            </div>

            {/* System Health Metrics */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
              {[
                {
                  label: 'Live Users',
                  value: '—',
                  desc: 'Active sessions',
                  color: 'text-blue-600',
                  bg: 'bg-blue-100',
                  icon: 'fa-user-check',
                },
                {
                  label: 'System Health',
                  value: 'OK',
                  desc: 'All systems operational',
                  color: 'text-green-600',
                  bg: 'bg-green-100',
                  icon: 'fa-heartbeat',
                },
                {
                  label: 'Storage Usage',
                  value: '—',
                  desc: 'Database capacity',
                  color: 'text-yellow-600',
                  bg: 'bg-yellow-100',
                  icon: 'fa-database',
                },
                {
                  label: 'API Requests',
                  value: '—',
                  desc: 'Last 24 hours',
                  color: 'text-purple-600',
                  bg: 'bg-purple-100',
                  icon: 'fa-code',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-4 shadow-sm hover:-translate-y-0.5 transition-transform"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${item.bg} ${item.color}`}
                  >
                    <i className={`fas ${item.icon}`}></i>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">
                      {item.label}
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                      {item.value}
                    </div>
                    <div className="text-xs text-gray-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </section>

            {/* People Statistics */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 shadow-sm">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  People Statistics
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  {
                    label: 'Active Interns',
                    value: people?.interns ?? 0,
                    pct: sharePct(people?.interns ?? 0),
                    trend: 'bg-green-100 text-green-600',
                  },
                  {
                    label: 'Active Employees',
                    value: people?.employees ?? 0,
                    pct: sharePct(people?.employees ?? 0),
                    trend: 'bg-gray-100 text-gray-500',
                  },
                  {
                    label: 'Active Team Leads',
                    value: people?.teamLeads ?? 0,
                    pct: sharePct(people?.teamLeads ?? 0),
                    trend: 'bg-green-100 text-green-600',
                  },
                  {
                    label: 'Document Alerts',
                    value: missingDocs?.count ?? 0,
                    pct: missingDocs?.percent ?? 0,
                    trend: 'bg-red-100 text-red-600',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="text-center p-5 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600"
                  >
                    <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                      {item.value}
                    </div>
                    <div className="text-sm text-gray-500 font-medium mb-2">
                      {item.label}
                    </div>
                    <div
                      className={`text-xs font-bold px-2 py-1 rounded-md inline-block ${item.trend}`}
                    >
                      {item.pct}%
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Admin Actions */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6 shadow-sm">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3 text-lg font-semibold text-gray-900 dark:text-white">
                  <i className="fas fa-cog text-blue-600"></i>
                  System Management
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link
                  href="/admin/users"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-blue-600 text-white">
                    <i className="fas fa-users-cog"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    User Management
                  </span>
                </Link>
                <Link
                  href="/admin/system"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-violet-500 text-white">
                    <i className="fas fa-sliders-h"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    System Settings
                  </span>
                </Link>
                <Link
                  href="/admin/security"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-red-500 text-white">
                    <i className="fas fa-clipboard-list"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    Audit Logs
                  </span>
                </Link>
                <Link
                  href="/admin/backup"
                  className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg bg-emerald-500 text-white">
                    <i className="fas fa-database"></i>
                  </div>
                  <span className="text-sm font-semibold text-gray-500">
                    Backup & Restore
                  </span>
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <AdminHome />
    </ProtectedRoute>
  );
}
