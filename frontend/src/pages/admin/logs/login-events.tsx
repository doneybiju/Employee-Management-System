import {useState, useEffect} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

interface LoginLog {
  id: number;
  createdAt: string;
  success: boolean;
  failReason: string | null;
  statusCode: number | null;
  email: string | null;
  userId: number | null;
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  ua: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  deviceId: string | null;
  fpHash: string | null;
  tzOffset: number | null;
  language: string | null;
  screen: string | null;
  platform: string | null;
  lat: number | null;
  lon: number | null;
  alerts?: Array<{
    kind: string;
    severity: string;
  }>;
}

export default function LoginEventsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const limit = 50;

  const fetchLogs = async (pageNum: number) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/admin/security/login-events?page=${pageNum}&pageSize=${limit}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const data = await response.json();
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch login logs:', err);
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
            Login Events
          </h1>
          <p className="text-gray-500 m-0">
            Authentication history and security events
          </p>
        </div>

        {loading ? (
          <div className="text-center p-12 text-gray-500 bg-white rounded-lg shadow-sm">
            Loading login events...
          </div>
        ) : !logs.length ? (
          <div className="text-center p-12 text-gray-500 bg-white rounded-lg shadow-sm">
            No login events found.
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
                      Status
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      User
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Location
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Device & Browser
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="text-left p-3 bg-gray-50 font-semibold text-gray-600 border-b-2 border-gray-200 whitespace-nowrap">
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const location =
                      [log.city, log.region, log.country]
                        .filter(Boolean)
                        .join(', ') || '-';
                    const deviceInfo =
                      [log.browser, log.os, log.deviceType]
                        .filter(Boolean)
                        .join(' • ') || '-';

                    return (
                      <tr
                        key={log.id}
                        className={`hover:bg-gray-50 border-b border-gray-100 ${log.success ? 'bg-green-50/30' : 'bg-red-50/30'}`}
                      >
                        <td className="p-3 align-top border-b border-gray-100">
                          <div className="text-sm text-gray-600 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </div>
                        </td>
                        <td className="p-3 align-top border-b border-gray-100">
                          <span
                            className={`inline-block px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap ${
                              log.success
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.success ? '✓ Success' : '✗ Failed'}
                          </span>
                          {!log.success && log.failReason && (
                            <div className="mt-1 text-xs text-red-600 capitalize">
                              {log.failReason.replace(/_/g, ' ')}
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 min-w-[180px]">
                          <div className="font-semibold text-gray-900">
                            {log.email || 'Unknown'}
                          </div>
                          {log.userId && (
                            <div className="text-xs text-gray-500 mt-1">
                              ID: {log.userId}
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 min-w-[150px]">
                          <div className="text-sm text-gray-700">
                            {location}
                          </div>
                          {(log.lat || log.lon) && (
                            <div className="text-[11px] text-gray-400 mt-1 font-mono">
                              {log.lat?.toFixed(4)}, {log.lon?.toFixed(4)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 min-w-[200px]">
                          <div className="text-sm text-gray-700 mb-1">
                            {deviceInfo}
                          </div>
                          {log.platform && (
                            <div className="text-[11px] text-gray-500">
                              Platform: {log.platform}
                            </div>
                          )}
                          {log.language && (
                            <div className="text-[11px] text-gray-500">
                              Lang: {log.language}
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 font-mono text-[13px]">
                          <div className="text-blue-800 font-medium">
                            {log.ip}
                          </div>
                          {log.deviceId && (
                            <div className="text-[11px] text-gray-500 mt-1">
                              Device: {log.deviceId.substring(0, 8)}...
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top border-b border-gray-100 text-center min-w-[100px]">
                          {log.alerts && log.alerts.length > 0 ? (
                            log.alerts.map((alert, idx) => {
                              const isWarning = alert.severity === 'medium';
                              const isHigh = alert.severity === 'high';
                              const badgeClass = isHigh
                                ? 'bg-red-100 text-red-800 border-red-400'
                                : isWarning
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-400'
                                  : 'bg-blue-100 text-blue-800 border-blue-400';
                              const icon =
                                alert.kind === 'NEW_DEVICE'
                                  ? '🆕'
                                  : alert.kind === 'NEW_COUNTRY'
                                    ? '🌍'
                                    : alert.kind === 'IMPOSSIBLE_TRAVEL'
                                      ? '✈️'
                                      : alert.kind === 'FAILED_STREAK'
                                        ? '❌'
                                        : '⚠️';
                              const label = alert.kind
                                .replace(/_/g, ' ')
                                .toLowerCase();

                              return (
                                <span
                                  key={idx}
                                  className={`inline-block px-2 py-1 rounded-lg text-xs font-semibold m-0.5 whitespace-nowrap border ${badgeClass}`}
                                  title={`${alert.severity}: ${label}`}
                                >
                                  {icon} {label}
                                </span>
                              );
                            })
                          ) : log.success ? (
                            <span className="inline-block px-2 py-1 rounded-lg text-xs font-semibold m-0.5 whitespace-nowrap bg-green-100 text-green-800 border border-green-400">
                              ✓ Known
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded-lg text-xs font-semibold m-0.5 whitespace-nowrap bg-gray-100 text-gray-500 border border-gray-300">
                              -
                            </span>
                          )}
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
                  'px-4 py-2 bg-blue-600 text-white border-none rounded-md cursor-pointer text-sm transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed'
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
                  'px-4 py-2 bg-blue-600 text-white border-none rounded-md cursor-pointer text-sm transition-colors hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed'
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
