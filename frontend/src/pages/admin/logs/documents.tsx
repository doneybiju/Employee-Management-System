import {useEffect, useState} from 'react';
import {fetchWithAuth} from '@/lib/api';
import {
  FileText,
  Trash2,
  RefreshCw,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';

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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 shrink-0 pl-16">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Document Logs
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Audit trail of document uploads and deletions
          </p>
        </div>
        <button
          onClick={() => fetchLogs(page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-[#111] shadow-sm flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-[180px]">
                  Time
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-[120px]">
                  Action
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Document
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  User
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Performed By
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading && logs.length === 0 ? (
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
                logs.map(log => (
                  <tr
                    key={log.id}
                    className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4 text-xs text-gray-500 font-mono whitespace-nowrap">
                      {formatDate(log.performedAt)}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          log.action === 'upload'
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                            : log.action === 'replace'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30'
                              : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30'
                        }`}
                      >
                        {log.action === 'upload' ? (
                          <UploadCloud size={12} />
                        ) : log.action === 'replace' ? (
                          <RefreshCw size={12} />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        {log.action.charAt(0).toUpperCase() +
                          log.action.slice(1)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-500">
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatDocumentType(log.documentType)}
                          </div>
                          <div
                            className="text-xs text-gray-500 max-w-[200px] truncate"
                            title={log.fileName}
                          >
                            {log.fileName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {log.employeeName || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                          {log.employeeId.substring(0, 8)}...
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                          <User size={12} />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {log.performedByName}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right text-xs text-gray-500 font-mono">
                      {log.ip || '—'}
                    </td>
                  </tr>
                ))
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
  );
}
