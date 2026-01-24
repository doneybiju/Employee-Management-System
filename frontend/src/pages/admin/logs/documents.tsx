import {useEffect, useState} from 'react';
import {fetchWithAuth} from '@/lib/api';

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
      const response = await fetchWithAuth(
        `/api/logs/documents?page=${pageNum}&limit=${limit}`,
      );
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
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Document Activity Logs</h1>
        <p className="text-sm text-gray-500">
          Track all document uploads and deletions by HR and admins
        </p>
      </div>

      {loading && logs.length === 0 ? (
        <div className="text-center p-16">Loading...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="p-3 text-left font-semibold text-sm">
                      Date & Time
                    </th>
                    <th className="p-3 text-left font-semibold text-sm">
                      Action
                    </th>
                    <th className="p-3 text-left font-semibold text-sm">
                      Document
                    </th>
                    <th className="p-3 text-left font-semibold text-sm">
                      For User
                    </th>
                    <th className="p-3 text-left font-semibold text-sm">
                      Performed By
                    </th>
                    <th className="p-3 text-left font-semibold text-sm">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="p-3 text-[13px] text-gray-600 whitespace-nowrap">
                        {formatDate(log.performedAt)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-xs font-semibold ${
                            log.action === 'upload'
                              ? 'bg-green-100 text-green-800'
                              : log.action === 'replace'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.action === 'upload'
                            ? '📤 Upload'
                            : log.action === 'replace'
                              ? '🔄 Replace'
                              : '🗑️ Delete'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-800 mb-1">
                          {formatDocumentType(log.documentType)}
                        </div>
                        <div className="text-xs text-gray-500 max-w-[250px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {log.fileName}
                        </div>
                        {log.expiryDate && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Expires:{' '}
                            {new Date(log.expiryDate).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-800">
                          {log.employeeName || 'Unknown'}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          {log.employeeId.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-800 mb-1">
                          {log.performedByName}
                        </div>
                        <div className="flex gap-1">
                          <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[11px] font-medium">
                            {log.performedByRole}
                          </span>
                          <span className="px-1.5 py-0.5 bg-blue-100 rounded text-[11px] font-medium">
                            {log.performedByEmpType.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-500">
                        {log.ip || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`px-4 py-2 text-sm font-medium rounded-lg border border-transparent ${
                  page === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`px-4 py-2 text-sm font-medium rounded-lg border border-transparent ${
                  page === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
