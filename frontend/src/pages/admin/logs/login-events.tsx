import {useState, useEffect} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Globe,
  Monitor,
} from 'lucide-react';

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
              Login Events
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Authentication history and security events
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
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-[120px]">
                    Status
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    User
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    Location
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                    Device
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
                      Loading events...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No login events found.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const location =
                      [log.city, log.region, log.country]
                        .filter(Boolean)
                        .join(', ') || '—';
                    const deviceInfo =
                      [log.browser, log.os, log.deviceType]
                        .filter(Boolean)
                        .join(' • ') || '—';

                    return (
                      <tr
                        key={log.id}
                        className={`group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                          !log.success ? 'bg-red-50/30 dark:bg-red-900/10' : ''
                        }`}
                      >
                        <td className="p-4 text-xs text-gray-500 font-mono whitespace-nowrap align-top">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${
                                log.success
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30'
                              }`}
                            >
                              {log.success ? (
                                <ShieldCheck size={12} />
                              ) : (
                                <ShieldAlert size={12} />
                              )}
                              {log.success ? 'Success' : 'Failed'}
                            </span>
                            {!log.success && log.failReason && (
                              <span className="text-[10px] text-red-600 dark:text-red-400 font-mono uppercase tracking-wide">
                                {log.failReason.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {log.email || 'Unknown'}
                          </div>
                          {log.userId && (
                            <div className="text-xs text-gray-500 font-mono mt-0.5">
                              ID: {log.userId}
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-start gap-2">
                            <Globe
                              size={14}
                              className="text-gray-400 mt-0.5 shrink-0"
                            />
                            <div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                {location}
                              </div>
                              {(log.lat || log.lon) && (
                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  {log.lat?.toFixed(4)}, {log.lon?.toFixed(4)}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-start gap-2">
                            {log.deviceType === 'mobile' ? (
                              <Smartphone
                                size={14}
                                className="text-gray-400 mt-0.5 shrink-0"
                              />
                            ) : (
                              <Monitor
                                size={14}
                                className="text-gray-400 mt-0.5 shrink-0"
                              />
                            )}
                            <div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                {deviceInfo}
                              </div>
                              {log.deviceId && (
                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  {log.deviceId.substring(0, 8)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right align-top">
                          <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
                            {log.ip}
                          </div>
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
