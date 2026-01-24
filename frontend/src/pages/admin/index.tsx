import Head from 'next/head';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import {fetchWithAuth} from '@/lib/api';
import {
  Users,
  ClipboardList,
  Briefcase,
  Activity,
  UserCog,
  Building2,
  FileText,
  Shield,
  ArrowRight,
} from 'lucide-react';

type RecentLogin = {
  id: number;
  user: string;
  email: string;
  time: string;
  ip: string;
};

type AdminSummary = {
  activeInterns: number;
  activeEmployees: number;
  activeTeamLeads: number;
  missingDocs: {count: number; total: number; percent: number};
  pendingRequestsCount: number;
  activeProjectsCount: number;
  recentLogins: RecentLogin[];
};

function AdminHome() {
  const {user} = useAuth();
  const [data, setData] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchWithAuth('/api/stats/admin/summary');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load admin stats', err);
      } finally {
        setLoading(false);
      }
    }
    if (user) load();
  }, [user]);

  const totalUsers = data
    ? (data.activeInterns || 0) +
      (data.activeEmployees || 0) +
      (data.activeTeamLeads || 0)
    : 0;

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0a0a0a] min-h-screen">
      <Head>
        <title>Admin Overview • Command Center</title>
      </Head>

      {/* Header */}
      <header className="mb-8 pl-16">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Admin Overview
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Welcome back, {user?.firstName || 'Administrator'}
        </p>
      </header>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Users
            </h3>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Users size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {loading ? '—' : totalUsers}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Across all roles & teams
          </div>
        </div>

        {/* Pending Requests */}
        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Pending Requests
            </h3>
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <ClipboardList
                size={20}
                className="text-amber-600 dark:text-amber-400"
              />
            </div>
          </div>
          <div
            className={`text-3xl font-bold ${
              (data?.pendingRequestsCount || 0) > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {loading ? '—' : (data?.pendingRequestsCount ?? 0)}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Awaiting your approval
          </div>
        </div>

        {/* Active Projects */}
        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Active Projects
            </h3>
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <Briefcase
                size={20}
                className="text-purple-600 dark:text-purple-400"
              />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {loading ? '—' : (data?.activeProjectsCount ?? 0)}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Currently in progress
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              System Status
            </h3>
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Activity
                size={20}
                className="text-green-600 dark:text-green-400"
              />
            </div>
          </div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            Healthy
          </div>
          <div className="mt-1 text-xs text-gray-400">
            All systems operational
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
        Management Modules
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          {
            title: 'User Management',
            desc: 'Manage employees, roles, and access.',
            icon: UserCog,
            href: '/admin/users',
            color: 'text-blue-600',
            bg: 'bg-blue-50 dark:bg-blue-900/20',
          },
          {
            title: 'Departments',
            desc: 'Configure organizational structure.',
            icon: Building2,
            href: '/departments',
            color: 'text-indigo-600',
            bg: 'bg-indigo-50 dark:bg-indigo-900/20',
          },
          {
            title: 'Document Management',
            desc: 'Handle contracts and files.',
            icon: FileText,
            href: '/admin/document-management',
            color: 'text-rose-600',
            bg: 'bg-rose-50 dark:bg-rose-900/20',
          },
          {
            title: 'System Logs',
            desc: 'View security and activity logs.',
            icon: Shield,
            href: '/admin/logs',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
          },
        ].map((item, i) => (
          <Link
            href={item.href}
            key={i}
            className="group bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 p-6 rounded-xl shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex flex-col"
          >
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.bg}`}
            >
              <item.icon size={24} className={item.color} />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
              {item.desc}
            </p>
            <div className="mt-4 flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
              Open Module <ArrowRight size={16} className="ml-1" />
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="flex-1 min-h-[300px] flex flex-col">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h2>
        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500">
                      Loading activity...
                    </td>
                  </tr>
                ) : (data?.recentLogins || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500">
                      No recent activity found.
                    </td>
                  </tr>
                ) : (
                  data!.recentLogins.map(log => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {log.user}
                          </span>
                          <span className="text-xs text-gray-500">
                            {log.email}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Login Success
                        </span>
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {log.ip}
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-500 dark:text-gray-400 text-right">
                        {new Date(log.time).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
