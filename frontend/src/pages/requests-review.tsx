// frontend/src/pages/requests-review.tsx
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth, getJson} from '@/lib/api';
import Link from 'next/link';
import {useEffect, useState} from 'react';

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

  // Filter rows based on active tab
  const filteredRows = rows.filter(row => {
    if (activeTab === 'all') return true;
    if (activeTab === 'absence') return row.kind === 'ABSENCE';
    if (activeTab === 'extra') return row.kind === 'EXTRA_HOURS';
    return true;
  });

  const absenceCount = rows.filter(r => r.kind === 'ABSENCE').length;
  const extraCount = rows.filter(r => r.kind === 'EXTRA_HOURS').length;
  const totalCount = rows.length;

  const [approvedSheetUrl, setApprovedSheetUrl] = useState<string | null>(null);

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

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-[400px] text-lg text-gray-500">
        Loading...
      </div>
    );

  if (!user)
    return (
      <div className="max-w-[400px] mx-auto my-16 p-8 bg-white rounded-xl shadow-sm text-center">
        <p className="mb-6 text-gray-500 text-base">
          Authentication required to access this page
        </p>
        <Link
          href="/login"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors hover:bg-blue-700 no-underline"
        >
          Login to Continue
        </Link>
      </div>
    );

  if (!(user.role === 'hr' || user.role === 'super_admin'))
    return (
      <div className="max-w-[400px] mx-auto my-16 p-8 bg-white rounded-xl shadow-sm text-center text-red-600 font-medium">
        Access Denied. You don't have permission to view this page.
      </div>
    );

  return (
    <>
      <main className="max-w-[1200px] mx-auto p-4 font-sans my-8">
        {/* Header */}
        <div className="bg-white rounded-xl p-8 mb-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="m-0 mb-2 text-[28px] font-bold text-gray-800">
                Request Review
              </h1>
              <p className="m-0 text-gray-500 text-base">
                Review and manage employee time off and extra hours requests
              </p>
            </div>
            <div className="flex gap-3 items-center">
              <button
                onClick={() => {
                  if (approvedSheetUrl)
                    window.open(
                      approvedSheetUrl,
                      '_blank',
                      'noopener,noreferrer',
                    );
                }}
                disabled={!approvedSheetUrl}
                className={`py-2.5 px-5 text-white rounded-lg font-medium border-none transition-all ${
                  approvedSheetUrl
                    ? 'bg-teal-700 hover:bg-teal-800 cursor-pointer'
                    : 'bg-slate-400 cursor-not-allowed opacity-80'
                }`}
                title={
                  approvedSheetUrl
                    ? 'Open the Google Sheet where approved requests are stored'
                    : 'Google Sheets is not configured'
                }
              >
                Open Google Sheet
              </button>

              <button
                onClick={() => {
                  void load();
                  void loadApprovedSheetUrl();
                }}
                disabled={isLoading}
                className={`py-2.5 px-5 bg-blue-600 text-white rounded-lg font-medium border-none transition-all ${
                  isLoading
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-blue-700'
                }`}
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-center">
              <div className="text-[32px] font-bold text-blue-600">
                {totalCount}
              </div>
              <div className="text-slate-500 text-sm font-medium mt-1">
                Total Pending
              </div>
            </div>
            <div className="bg-sky-50 p-6 rounded-lg border border-sky-200 text-center">
              <div className="text-[32px] font-bold text-sky-700">
                {absenceCount}
              </div>
              <div className="text-sky-900 text-sm font-medium mt-1">
                Absence Requests
              </div>
            </div>
            <div className="bg-green-50 p-6 rounded-lg border border-green-200 text-center">
              <div className="text-[32px] font-bold text-green-600">
                {extraCount}
              </div>
              <div className="text-green-800 text-sm font-medium mt-1">
                Extra Hours
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex bg-slate-50 border-b border-slate-200 px-8">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-4 px-6 border-none font-medium cursor-pointer transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'all'
                  ? 'bg-white text-blue-600 border-blue-600'
                  : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              All Requests
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  activeTab === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {totalCount}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('absence')}
              className={`py-4 px-6 border-none font-medium cursor-pointer transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'absence'
                  ? 'bg-white text-blue-600 border-blue-600'
                  : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Absence
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  activeTab === 'absence'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {absenceCount}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('extra')}
              className={`py-4 px-6 border-none font-medium cursor-pointer transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'extra'
                  ? 'bg-white text-blue-600 border-blue-600'
                  : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Extra Hours
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  activeTab === 'extra'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {extraCount}
              </span>
            </button>
          </div>

          <div className="p-8">
            {isLoading ? (
              <div className="flex justify-center items-center py-12 text-gray-500">
                Loading requests...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="m-0 mb-2 text-gray-700">No pending requests</h3>
                <p>
                  There are no {activeTab !== 'all' ? activeTab : ''} requests
                  waiting for review.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">
                        Employee
                      </th>
                      {activeTab === 'all' && (
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">
                          Type
                        </th>
                      )}
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">
                        Date(s)
                      </th>
                      {(activeTab === 'all' || activeTab === 'extra') && (
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">
                          Time Window
                        </th>
                      )}
                      {(activeTab === 'all' || activeTab === 'absence') && (
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">
                          Reason & Details
                        </th>
                      )}
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider w-[300px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(r => {
                      const dates = r.date
                        ? r.date
                        : r.rangeStart && r.rangeEnd
                          ? `${r.rangeStart} to ${r.rangeEnd}`
                          : '—';
                      const windowLabel =
                        r.startMin != null && r.endMin != null
                          ? `${minToLabel(r.startMin)} – ${minToLabel(r.endMin)}`
                          : '—';

                      return (
                        <tr
                          key={r.id}
                          className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                        >
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-800">
                              {r.name}
                            </div>
                            <div className="text-gray-500 text-xs mt-0.5">
                              {r.email || '—'}
                            </div>
                          </td>
                          {activeTab === 'all' && (
                            <td className="px-4 py-4">
                              <span
                                className={`inline-block px-2 py-1 rounded-md text-xs font-medium border ${
                                  r.kind === 'EXTRA_HOURS'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-sky-50 text-sky-700 border-sky-200'
                                }`}
                              >
                                {r.kind === 'EXTRA_HOURS'
                                  ? 'Extra Hours'
                                  : 'Absence'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-4 text-gray-700 font-medium">
                            {dates}
                          </td>
                          {(activeTab === 'all' || activeTab === 'extra') && (
                            <td className="px-4 py-4 text-gray-500">
                              {windowLabel}
                            </td>
                          )}
                          {(activeTab === 'all' || activeTab === 'absence') && (
                            <td className="px-4 py-4">
                              <div className="font-medium text-gray-800">
                                {r.reason || '—'}
                              </div>
                              {r.comment && (
                                <div className="text-gray-500 text-xs mt-1 italic">
                                  {r.comment}
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-4">
                            <div className="flex gap-3 items-start">
                              <input
                                placeholder="Review notes..."
                                value={note[r.id] ?? r.reviewNote ?? ''}
                                onChange={e =>
                                  setNote(s => ({...s, [r.id]: e.target.value}))
                                }
                                className="flex-1 py-2 px-3 border border-gray-300 rounded-md text-sm transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => act(r.id, 'approve')}
                                  disabled={isActing}
                                  className={`py-2 px-4 bg-green-600 text-white border-none rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                                    isActing
                                      ? 'opacity-60 cursor-not-allowed'
                                      : 'hover:bg-green-700 cursor-pointer'
                                  }`}
                                >
                                  Approve
                                </button>

                                <button
                                  onClick={() => act(r.id, 'reject')}
                                  disabled={isActing}
                                  className={`py-2 px-4 bg-transparent text-red-600 border border-red-600 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                                    isActing
                                      ? 'opacity-60 cursor-not-allowed'
                                      : 'hover:bg-red-50 cursor-pointer'
                                  }`}
                                >
                                  Reject
                                </button>
                                {isActing && (
                                  <div className="fixed inset-0 bg-black/35 z-[2000] flex items-center justify-center pointer-events-auto">
                                    <div className="bg-white px-5 py-3.5 rounded-lg shadow-xl font-semibold text-gray-700 min-w-[160px] text-center">
                                      Processing…
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Rejection Reason Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000] p-4">
          <div className="bg-white rounded-xl p-8 w-full max-w-[500px] shadow-2xl">
            <div className="mb-6">
              <h2 className="m-0 mb-2 text-xl font-bold text-gray-800">
                Rejection Reason Required
              </h2>
              <p className="m-0 text-gray-500 text-sm">
                Please provide a reason for rejecting {pendingRejection?.name}'s
                request.
              </p>
            </div>

            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-gray-700">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-y transition-colors font-inherit focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
              <p className="mt-2 text-xs text-gray-500">
                This reason will be visible to the employee.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleRejectCancel}
                className="py-2.5 px-5 bg-transparent text-gray-500 border border-gray-300 rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-gray-50 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectionReason.trim()}
                className={`py-2.5 px-5 text-white border-none rounded-lg text-sm font-medium transition-colors ${
                  !rejectionReason.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 cursor-pointer'
                }`}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
