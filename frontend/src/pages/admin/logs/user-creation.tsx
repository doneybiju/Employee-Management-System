import {useState, useEffect} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Briefcase,
  Shield,
  User,
  Globe,
  Monitor,
} from 'lucide-react';

interface UserCreationLog {
  id: number;
  userId: number;
  firstName: string;
  surname: string;
  companyEmail: string;
  empId: string;
  role: string;
  empType: string;
  createdBy: number | null;
  createdByName?: string;
  createdByRole?: string | null;
  createdByEmpType?: string | null;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  creationMethod?: string;
}

export default function UserCreationLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<UserCreationLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const limit = 50;

  const fetchLogs = async (pageNum: number) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/logs/user-creation?page=${pageNum}&limit=${limit}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch user creation logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <ProtectedRoute roles={['super_admin']}>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6 shrink-0 pl-16">
          <div>
            <button
              onClick={() => router.push('/admin/logs')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-1"
            >
              ← Back to Logs
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              User Creation Logs
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Audit trail of new account creations
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-[#111] shadow-sm flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-[160px]">
                    Time
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    New User
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    Role & Type
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    Created By
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    Method
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right w-[140px]">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Loading logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const createdUser = `${log.firstName} ${log.surname}`;
                    const createdBy = log.createdByName || 'System';
                    const methodLabel =
                      log.creationMethod === 'google_workspace'
                        ? 'Google Workspace'
                        : log.creationMethod === 'csv_import'
                          ? 'CSV Import'
                          : log.creationMethod || 'Unknown';

                    return (
                      <tr
                        key={log.id}
                        className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4 text-xs text-gray-500 font-mono whitespace-nowrap align-top">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
                              <UserPlus size={16} />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white text-sm">
                                {createdUser}
                              </div>
                              <div className="text-xs text-gray-500">
                                {log.companyEmail}
                              </div>
                              <div className="text-xs text-gray-400 font-mono mt-0.5">
                                ID: {log.empId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30">
                              <Shield size={10} />
                              {log.role}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/30">
                              <Briefcase size={10} />
                              {log.empType.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-gray-500 text-[10px]">
                              <User size={12} />
                            </div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {createdBy}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300">
                            {methodLabel === 'Google Workspace' ? (
                              <Globe size={10} />
                            ) : (
                              <Monitor size={10} />
                            )}
                            {methodLabel}
                          </span>
                        </td>
                        <td className="p-4 text-right text-xs text-gray-500 font-mono align-top">
                          {log.ip || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-[#111] flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
