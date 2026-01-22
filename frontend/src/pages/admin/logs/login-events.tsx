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
      <div className="login-events-page">
        <div className="header-section">
          <button
            className="back-button"
            onClick={() => router.push('/admin/logs')}
          >
            ← Back to Logs
          </button>
          <h1>Login Events</h1>
          <p className="subtitle">Authentication history and security events</p>
        </div>

        {loading ? (
          <div className="loading">Loading login events...</div>
        ) : !logs.length ? (
          <div className="no-data">No login events found.</div>
        ) : (
          <div className="logs-container">
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Status</th>
                    <th>User</th>
                    <th>Location</th>
                    <th>Device & Browser</th>
                    <th>IP Address</th>
                    <th>Flags</th>
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
                        className={log.success ? 'row-success' : 'row-failure'}
                      >
                        <td>
                          <div className="datetime-cell">
                            {formatDate(log.createdAt)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-badge ${log.success ? 'status-success' : 'status-failure'}`}
                          >
                            {log.success ? '✓ Success' : '✗ Failed'}
                          </span>
                          {!log.success && log.failReason && (
                            <div className="fail-reason">
                              {log.failReason.replace(/_/g, ' ')}
                            </div>
                          )}
                        </td>
                        <td className="user-cell">
                          <div className="user-email">
                            {log.email || 'Unknown'}
                          </div>
                          {log.userId && (
                            <div className="user-id">ID: {log.userId}</div>
                          )}
                        </td>
                        <td className="location-cell">
                          <div className="location-text">{location}</div>
                          {(log.lat || log.lon) && (
                            <div className="coordinates">
                              {log.lat?.toFixed(4)}, {log.lon?.toFixed(4)}
                            </div>
                          )}
                        </td>
                        <td className="device-cell">
                          <div className="device-info">{deviceInfo}</div>
                          {log.platform && (
                            <div className="platform">
                              Platform: {log.platform}
                            </div>
                          )}
                          {log.language && (
                            <div className="language">Lang: {log.language}</div>
                          )}
                        </td>
                        <td className="ip-cell">
                          <div className="ip-address">{log.ip}</div>
                          {log.deviceId && (
                            <div className="device-id">
                              Device: {log.deviceId.substring(0, 8)}...
                            </div>
                          )}
                        </td>
                        <td className="flags-cell">
                          {log.alerts && log.alerts.length > 0 ? (
                            log.alerts.map((alert, idx) => {
                              const isWarning = alert.severity === 'medium';
                              const isHigh = alert.severity === 'high';
                              const badgeClass = isHigh
                                ? 'flag-alert'
                                : isWarning
                                  ? 'flag-warning'
                                  : 'flag-info';
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
                                  className={`flag-badge ${badgeClass}`}
                                  title={`${alert.severity}: ${label}`}
                                >
                                  {icon} {label}
                                </span>
                              );
                            })
                          ) : log.success ? (
                            <span className="flag-badge flag-ok">✓ Known</span>
                          ) : (
                            <span className="flag-badge flag-neutral">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(total / limit) || 1}
              </span>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        <style jsx>{`
          .login-events-page {
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
          }

          .header-section {
            margin-bottom: 2rem;
          }

          .back-button {
            background: none;
            border: none;
            color: #2563eb;
            cursor: pointer;
            font-size: 0.95rem;
            padding: 0.5rem 0;
            margin-bottom: 1rem;
            display: inline-block;
            transition: color 0.2s;
          }

          .back-button:hover {
            color: #1d4ed8;
            text-decoration: underline;
          }

          .header-section h1 {
            margin: 0 0 0.5rem 0;
            font-size: 2rem;
            color: #1a1a1a;
          }

          .subtitle {
            color: #666;
            margin: 0;
          }

          .logs-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            padding: 1.5rem;
          }

          .table-responsive {
            overflow-x: auto;
          }

          .logs-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
          }

          .logs-table th {
            text-align: left;
            padding: 0.75rem;
            background: #f8f9fa;
            font-weight: 600;
            color: #495057;
            border-bottom: 2px solid #dee2e6;
            white-space: nowrap;
          }

          .logs-table td {
            padding: 0.75rem;
            border-bottom: 1px solid #e9ecef;
            vertical-align: top;
          }

          .logs-table tr:hover {
            background: #f8f9fa;
          }

          .logs-table tr.row-success {
            background: #f0fdf4;
          }

          .logs-table tr.row-failure {
            background: #fef2f2;
          }

          .datetime-cell {
            font-size: 0.875rem;
            color: #4b5563;
            white-space: nowrap;
          }

          .status-badge {
            display: inline-block;
            padding: 0.3rem 0.75rem;
            border-radius: 12px;
            font-size: 0.875rem;
            font-weight: 600;
            white-space: nowrap;
          }

          .status-success {
            background: #d1fae5;
            color: #065f46;
          }

          .status-failure {
            background: #fee2e2;
            color: #991b1b;
          }

          .fail-reason {
            margin-top: 0.25rem;
            font-size: 0.75rem;
            color: #dc2626;
            text-transform: capitalize;
          }

          .user-cell {
            min-width: 180px;
          }

          .user-email {
            font-weight: 600;
            color: #1f2937;
          }

          .user-id {
            font-size: 0.75rem;
            color: #6b7280;
            margin-top: 0.25rem;
          }

          .location-cell {
            min-width: 150px;
          }

          .location-text {
            color: #374151;
            font-size: 0.875rem;
          }

          .coordinates {
            font-size: 0.7rem;
            color: #9ca3af;
            margin-top: 0.25rem;
            font-family: 'Courier New', monospace;
          }

          .device-cell {
            min-width: 200px;
          }

          .device-info {
            font-size: 0.875rem;
            color: #374151;
            margin-bottom: 0.25rem;
          }

          .platform,
          .language {
            font-size: 0.7rem;
            color: #6b7280;
          }

          .ip-cell {
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
          }

          .ip-address {
            color: #1e40af;
            font-weight: 500;
          }

          .device-id {
            font-size: 0.7rem;
            color: #6b7280;
            margin-top: 0.25rem;
          }

          .flags-cell {
            text-align: center;
            min-width: 100px;
          }

          .flag-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 8px;
            font-size: 0.75rem;
            font-weight: 600;
            margin: 0.125rem;
            white-space: nowrap;
          }

          .flag-warning {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fbbf24;
          }

          .flag-alert {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #f87171;
          }

          .flag-ok {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #34d399;
          }

          .flag-info {
            background: #dbeafe;
            color: #1e40af;
            border: 1px solid #60a5fa;
          }

          .flag-neutral {
            background: #f3f4f6;
            color: #6b7280;
            border: 1px solid #d1d5db;
          }

          .pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 1rem;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e9ecef;
          }

          .pagination button {
            padding: 0.5rem 1rem;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.875rem;
            transition: background 0.2s;
          }

          .pagination button:hover:not(:disabled) {
            background: #1d4ed8;
          }

          .pagination button:disabled {
            background: #cbd5e1;
            cursor: not-allowed;
          }

          .pagination span {
            font-size: 0.875rem;
            color: #64748b;
          }

          .loading,
          .no-data {
            text-align: center;
            padding: 3rem;
            color: #666;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          @media (max-width: 768px) {
            .login-events-page {
              padding: 1rem;
            }

            .logs-table {
              font-size: 0.75rem;
            }

            .logs-table th,
            .logs-table td {
              padding: 0.5rem;
            }

            .user-agent {
              max-width: 150px;
            }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
}
