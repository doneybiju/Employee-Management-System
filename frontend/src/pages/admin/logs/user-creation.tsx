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
      <div className="user-creation-page">
        <div className="header-section">
          <button
            className="back-button"
            onClick={() => router.push('/admin/logs')}
          >
            ← Back to Logs
          </button>
          <h1>User Creation Logs</h1>
          <p className="subtitle">
            Track user account creation history and audit trail
          </p>
        </div>

        {loading ? (
          <div className="loading">Loading user creation logs...</div>
        ) : !logs.length ? (
          <div className="no-data">No user creation logs found.</div>
        ) : (
          <div className="logs-container">
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>User Created</th>
                    <th>Created By</th>
                    <th>Method</th>
                    <th>IP Address</th>
                    <th>Device Info</th>
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
                      <tr key={log.id}>
                        <td>
                          <div className="date-time">
                            {formatDate(log.createdAt)}
                          </div>
                        </td>
                        <td className="user-created-cell">
                          <div className="user-info">
                            <div className="user-name-large">{createdUser}</div>
                            <div className="user-details">
                              <span className="detail-item">
                                {log.companyEmail}
                              </span>
                              <span className="detail-separator">•</span>
                              <span className="detail-item">
                                ID: {log.empId}
                              </span>
                            </div>
                            <div className="user-badges">
                              <span className={`role-badge role-${log.role}`}>
                                {log.role}
                              </span>
                              <span
                                className={`emp-type-badge emp-${log.empType}`}
                              >
                                {log.empType.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="creator-cell">
                          <div className="creator-info">
                            <div className="creator-name-large">
                              {createdBy}
                            </div>
                            {log.createdBy && (
                              <div className="creator-details">
                                {creatorRole && (
                                  <span
                                    className={`role-badge-sm role-${log.createdByRole}`}
                                  >
                                    {creatorRole}
                                  </span>
                                )}
                                {creatorEmpType && (
                                  <span
                                    className={`emp-type-badge-sm emp-${log.createdByEmpType}`}
                                  >
                                    {creatorEmpType}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="method-badge">{methodLabel}</span>
                        </td>
                        <td className="ip-cell">{log.ip || '-'}</td>
                        <td className="user-agent-cell">
                          <div
                            className="user-agent-text"
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
          .user-creation-page {
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

          .date-time {
            font-size: 0.875rem;
            color: #4b5563;
            white-space: nowrap;
          }

          .user-created-cell,
          .creator-cell {
            min-width: 200px;
          }

          .user-info,
          .creator-info {
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
          }

          .user-name-large {
            font-weight: 600;
            color: #059669;
            font-size: 0.95rem;
          }

          .creator-name-large {
            font-weight: 600;
            color: #2563eb;
            font-size: 0.95rem;
          }

          .user-details {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            font-size: 0.8rem;
            color: #6b7280;
          }

          .detail-item {
            white-space: nowrap;
          }

          .detail-separator {
            color: #d1d5db;
          }

          .user-badges,
          .creator-details {
            display: flex;
            gap: 0.375rem;
            flex-wrap: wrap;
          }

          .role-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            white-space: nowrap;
          }

          .role-intern {
            background: #dbeafe;
            color: #1e40af;
          }

          .role-hr {
            background: #fef3c7;
            color: #92400e;
          }

          .role-super_admin {
            background: #f3e8ff;
            color: #6b21a8;
          }

          .emp-type-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            white-space: nowrap;
            text-transform: capitalize;
          }

          .emp-intern {
            background: #e0f2fe;
            color: #075985;
          }

          .emp-employee {
            background: #dcfce7;
            color: #166534;
          }

          .emp-team_lead {
            background: #fef3c7;
            color: #854d0e;
          }

          .role-badge-sm,
          .emp-type-badge-sm {
            display: inline-block;
            padding: 0.15rem 0.5rem;
            border-radius: 10px;
            font-size: 0.7rem;
            font-weight: 600;
            white-space: nowrap;
            text-transform: capitalize;
          }

          .role-badge-sm.role-intern {
            background: #dbeafe;
            color: #1e40af;
          }

          .role-badge-sm.role-hr {
            background: #fef3c7;
            color: #92400e;
          }

          .role-badge-sm.role-super_admin {
            background: #f3e8ff;
            color: #6b21a8;
          }

          .emp-type-badge-sm.emp-intern {
            background: #e0f2fe;
            color: #075985;
          }

          .emp-type-badge-sm.emp-employee {
            background: #dcfce7;
            color: #166534;
          }

          .emp-type-badge-sm.emp-team_lead {
            background: #fef3c7;
            color: #854d0e;
          }

          .method-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            background: #f3f4f6;
            color: #374151;
            white-space: nowrap;
          }

          .ip-cell {
            font-family: 'Courier New', monospace;
            font-size: 0.8rem;
            color: #6b7280;
          }

          .user-agent-cell {
            max-width: 250px;
          }

          .user-agent-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 0.8rem;
            color: #6b7280;
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
            background: #8b5cf6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.875rem;
            transition: background 0.2s;
          }

          .pagination button:hover:not(:disabled) {
            background: #7c3aed;
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
            .user-creation-page {
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
