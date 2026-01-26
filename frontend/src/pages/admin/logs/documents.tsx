import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface DocumentLog {
  id: number;
  action: string;
  documentType: string;
  fileName: string;
  fileId: string | null;
  employeeId: string;
  employeeName: string | null;
  userId: number | null;
  performedBy: number;
  performedByName: string;
  performedByRole: string;
  performedByEmpType: string;
  performedAt: string;
  ip: string | null;
  userAgent: string | null;
  expiryDate: string | null;
}

export default function DocumentLogsPage() {
  const [logs, setLogs] = useState<DocumentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchLogs = async (pageNum: number) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/logs/documents?page=${pageNum}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to fetch document logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDocumentType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Document Activity Logs</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Track all document uploads and deletions by HR and admins
        </p>
      </div>

      {loading && logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>Loading...</div>
      ) : (
        <>
          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>Date & Time</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>Action</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>Document</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>For User</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>Performed By</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 12, fontSize: 13, color: '#4b5563', whiteSpace: 'nowrap' }}>
                        {formatDate(log.performedAt)}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: log.action === 'upload' ? '#d1fae5' 
                              : log.action === 'replace' ? '#fef3c7' 
                              : '#fee2e2',
                            color: log.action === 'upload' ? '#065f46' 
                              : log.action === 'replace' ? '#92400e' 
                              : '#991b1b',
                          }}
                        >
                          {log.action === 'upload' ? '📤 Upload' 
                            : log.action === 'replace' ? '🔄 Replace' 
                            : '🗑️ Delete'}
                        </span>
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>
                          {formatDocumentType(log.documentType)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.fileName}
                        </div>
                        {log.expiryDate && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                            Expires: {new Date(log.expiryDate).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 500, color: '#1f2937' }}>
                          {log.employeeName || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                          {log.employeeId.substring(0, 8)}...
                        </div>
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 500, color: '#1f2937', marginBottom: 4 }}>
                          {log.performedByName}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              background: '#e5e7eb',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            {log.performedByRole}
                          </span>
                          <span
                            style={{
                              padding: '2px 6px',
                              background: '#dbeafe',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            {log.performedByEmpType.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
                        {log.ip || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '8px 16px',
                  background: page === 1 ? '#f3f4f6' : '#2d8cf0',
                  color: page === 1 ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: 14, color: '#6b7280' }}>
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '8px 16px',
                  background: page === totalPages ? '#f3f4f6' : '#2d8cf0',
                  color: page === totalPages ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .logs-table tr:hover {
          background: #f9fafb;
        }
      `}</style>
    </main>
  );
}
