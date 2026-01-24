// frontend/src/pages/requests-review.tsx
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth, getJson} from '@/lib/api';
import {useEffect, useState} from 'react';
import {
  Check,
  X,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Calendar,
  Clock,
} from 'lucide-react';

type Row = {
  id: number;
  kind: 'EXTRA_HOURS' | 'ABSENCE';
  name: string;
  email: string | null;
  date?: string;
  rangeStart?: string;
  rangeEnd?: string;
  startMin?: number;
  endMin?: number;
  minutes?: number;
  reason?: string | null;
  comment?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewNote?: string | null;
};

const minToLabel = (m: number) => {
  const h = Math.floor(m / 60),
    mm = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
};

export default function RequestsReview() {
  const {user, loading} = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'absence' | 'extra'>(
    'all',
  );
  const [isLoading, setIsLoading] = useState(false);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [pendingRejection, setPendingRejection] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isActing, setIsActing] = useState(false);

  const [approvedSheetUrl, setApprovedSheetUrl] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await getJson<Row[]>('/api/requests');
      setRows(data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadApprovedSheetUrl = async () => {
    try {
      const data = await getJson<{url: string}>('/api/requests/approved-sheet');
      setApprovedSheetUrl(data?.url || null);
    } catch {
      setApprovedSheetUrl(null);
    }
  };

  useEffect(() => {
    if (
      !loading &&
      user &&
      (user.role === 'hr' || user.role === 'super_admin')
    ) {
      load();
      loadApprovedSheetUrl();
    }
  }, [loading, user]);

  // Filter rows based on active tab and search
  const filteredRows = rows.filter(row => {
    // Tab filter
    if (activeTab === 'absence' && row.kind !== 'ABSENCE') return false;
    if (activeTab === 'extra' && row.kind !== 'EXTRA_HOURS') return false;

    // Search filter
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const match =
        row.name.toLowerCase().includes(needle) ||
        (row.email || '').toLowerCase().includes(needle) ||
        (row.reason || '').toLowerCase().includes(needle);
      if (!match) return false;
    }

    return true;
  });

  const absenceCount = rows.filter(r => r.kind === 'ABSENCE').length;
  const extraCount = rows.filter(r => r.kind === 'EXTRA_HOURS').length;
  const totalCount = rows.length;

  const act = async (id: number, action: 'approve' | 'reject') => {
    try {
      const n = (
        note[id] ??
        rows.find(r => r.id === id)?.reviewNote ??
        ''
      ).trim();

      if (action === 'reject' && !n) {
        // open modal for reason
        const request = rows.find(r => r.id === id);
        setPendingRejection({id, name: request?.name || 'Unknown'});
        setRejectionReason('');
        setRejectModalOpen(true);
        return;
      }

      setIsActing(true);
      await fetchWithAuth(`/api/requests/${id}/review`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action, note: n}),
      });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Action failed');
    } finally {
      setIsActing(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!pendingRejection) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }

    try {
      setIsActing(true);
      await fetchWithAuth(`/api/requests/${pendingRejection.id}/review`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'reject', note: rejectionReason.trim()}),
      });
      setNote(s => ({...s, [pendingRejection.id]: rejectionReason.trim()}));
      await load();
      setRejectModalOpen(false);
      setPendingRejection(null);
      setRejectionReason('');
    } catch (e: any) {
      alert(e?.message || 'Rejection failed');
    } finally {
      setIsActing(false);
    }
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setPendingRejection(null);
    setRejectionReason('');
  };

  if (loading) return null;

  if (!user)
    return (
      <div className="flex justify-center items-center h-screen text-gray-500">
        Authentication required.
      </div>
    );

  if (!(user.role === 'hr' || user.role === 'super_admin'))
    return (
      <div className="flex justify-center items-center h-screen text-red-600 font-medium">
        Access Denied.
      </div>
    );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0 pl-16">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Request Review
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage employee time off and extra hours
          </p>
        </div>

        <div className="flex items-center gap-3">
          {approvedSheetUrl && (
            <button
              onClick={() =>
                window.open(approvedSheetUrl, '_blank', 'noopener,noreferrer')
              }
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-green-700 dark:text-green-400"
            >
              <FileSpreadsheet size={16} /> Google Sheet
            </button>
          )}
          <button
            onClick={() => {
              void load();
              void loadApprovedSheetUrl();
            }}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6 shrink-0">
        <div className="bg-white dark:bg-[#111] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totalCount}
          </div>
          <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mt-1">
            Total Pending
          </div>
        </div>
        <div className="bg-white dark:bg-[#111] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">
            {absenceCount}
          </div>
          <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mt-1">
            Absence
          </div>
        </div>
        <div className="bg-white dark:bg-[#111] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {extraCount}
          </div>
          <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mt-1">
            Extra Hours
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 shrink-0">
        <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
          {(['all', 'absence', 'extra'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
                activeTab === t
                  ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search requests..."
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-[#111] shadow-sm flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Employee
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Type
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Details
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 w-[350px]">
                  Review
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    No requests found.
                  </td>
                </tr>
              ) : (
                filteredRows.map(r => {
                  const dates = r.date
                    ? r.date
                    : r.rangeStart && r.rangeEnd
                      ? `${r.rangeStart} → ${r.rangeEnd}`
                      : '—';
                  const windowLabel =
                    r.startMin != null && r.endMin != null
                      ? `${minToLabel(r.startMin)} – ${minToLabel(r.endMin)}`
                      : null;

                  return (
                    <tr
                      key={r.id}
                      className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                              {r.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {r.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            r.kind === 'EXTRA_HOURS'
                              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
                              : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-900/30'
                          }`}
                        >
                          {r.kind === 'EXTRA_HOURS' ? 'Extra Hours' : 'Absence'}
                        </span>
                      </td>
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1 text-sm">
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                            <Calendar size={14} className="text-gray-400" />
                            {dates}
                          </div>
                          {windowLabel && (
                            <div className="flex items-center gap-2 text-gray-500 text-xs">
                              <Clock size={14} className="text-gray-400" />
                              {windowLabel}
                            </div>
                          )}
                          {r.reason && (
                            <div className="mt-1 text-gray-900 dark:text-gray-100 font-medium">
                              {r.reason}
                            </div>
                          )}
                          {r.comment && (
                            <div className="text-gray-500 text-xs italic">
                              "{r.comment}"
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-2">
                          <input
                            placeholder="Add a note..."
                            value={note[r.id] ?? r.reviewNote ?? ''}
                            onChange={e =>
                              setNote(s => ({...s, [r.id]: e.target.value}))
                            }
                            className="w-full p-2 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-colors"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => act(r.id, 'approve')}
                              disabled={isActing}
                              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              <Check size={14} /> Approve
                            </button>
                            <button
                              onClick={() => act(r.id, 'reject')}
                              disabled={isActing}
                              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white dark:bg-transparent border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            >
                              <X size={14} /> Reject
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800 p-6 animate-[scaleIn_0.2s_ease-out]">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Reject Request
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Please provide a reason for rejecting{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {pendingRejection?.name}
              </span>
              's request.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g., Overlap with team meeting..."
                rows={4}
                className="w-full p-3 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleRejectCancel}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
