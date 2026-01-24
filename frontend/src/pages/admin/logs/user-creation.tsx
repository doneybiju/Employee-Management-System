import {useState, useEffect} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

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

  return (
    <ProtectedRoute roles={['super_admin']}>
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="mb-8">
          <button
            className="bg-transparent border-none text-blue-600 cursor-pointer text-sm py-2 mb-4 inline-block transition-colors hover:text-blue-700 hover:underline"
            onClick={() => router.push('/admin/logs')}
          >
            ← Back to Logs
          </button>
          <h1 className="m-0 mb-2 text-2xl text-gray-900 font-bold">
            User Creation Logs
          </h1>
          <p className="text-gray-500 m-0">
            Track user account creation history and audit trail
          </p>
        </div>

        {loading ? (
          <div className="text-center p-12 text-gray-500 bg-white rounded-lg shadow-sm">
            Loading user creation logs...
          </div>
        ) : !logs.length ? (
          <div className="text-center p-12 text-gray-500 bg-white rounded-lg shadow-sm">
            No user creation logs found.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Date/Time
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      User Created
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Created By
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Method
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Device Info
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const createdUser = `${log.firstName} ${log.surname}`;
                    const createdBy = log.createdByName || 'System';
                    const creatorRole = log.createdByRole
                      ? log.createdByRole.replace('_', ' ')
                      : '';
                    const creatorEmpType = log.createdByEmpType
                      ? log.createdByEmpType.replace('_', ' ')
                      : '';
                    const methodLabel =
                      log.creationMethod === 'google_workspace'
                        ? 'Google Workspace'
                        : log.creationMethod === 'csv_import'
                          ? 'CSV Import'
                          : log.creationMethod || 'Unknown';

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 border-b border-gray-100"
                      >
                        <td className="p-3 align-top border-b border-gray-100">
                          <div className="text-sm text-gray-600 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </div>
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 min-w-[200px]">
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold text-emerald-600 text-sm">
                              {createdUser}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <span className="whitespace-nowrap">
                                {log.companyEmail}
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="whitespace-nowrap">
                                ID: {log.empId}
                              </span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap ${
                                  log.role === 'intern'
                                    ? 'bg-blue-100 text-blue-800'
                                    : log.role === 'hr'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {log.role}
                              </span>
                              <span
                                className={`inline-block px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap capitalize ${
                                  log.empType === 'intern'
                                    ? 'bg-sky-100 text-sky-800'
                                    : log.empType === 'employee'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {log.empType.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 min-w-[200px]">
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold text-blue-600 text-sm">
                              {createdBy}
                            </div>
                            {log.createdBy && (
                              <div className="flex gap-1.5 flex-wrap">
                                {creatorRole && (
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-semibold whitespace-nowrap capitalize ${
                                      log.createdByRole === 'intern'
                                        ? 'bg-blue-100 text-blue-800'
                                        : log.createdByRole === 'hr'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : 'bg-purple-100 text-purple-800'
                                    }`}
                                  >
                                    {creatorRole}
                                  </span>
                                )}
                                {creatorEmpType && (
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-semibold whitespace-nowrap capitalize ${
                                      log.createdByEmpType === 'intern'
                                        ? 'bg-sky-100 text-sky-800'
                                        : log.createdByEmpType === 'employee'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                  >
                                    {creatorEmpType}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 align-top border-b border-gray-100">
                          <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                            {methodLabel}
                          </span>
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 font-mono text-[13px] text-gray-500">
                          {log.ip || '-'}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 max-w-[250px]">
                          <div
                            className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-gray-500"
                            title={log.userAgent || '-'}
                          >
                            {log.userAgent || '-'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center gap-4 mt-6 pt-6 border-t border-gray-200">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className={
                  'px-4 py-2 bg-violet-500 text-white border-none rounded-md cursor-pointer text-sm transition-colors hover:bg-violet-600 disabled:bg-gray-300 disabled:cursor-not-allowed'
                }
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {Math.ceil(total / limit) || 1}
              </span>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage(page + 1)}
                className={
                  'px-4 py-2 bg-violet-500 text-white border-none rounded-md cursor-pointer text-sm transition-colors hover:bg-violet-600 disabled:bg-gray-300 disabled:cursor-not-allowed'
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
