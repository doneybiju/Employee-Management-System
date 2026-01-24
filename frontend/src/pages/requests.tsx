// frontend/src/pages/requests.tsx
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth, postJson} from '@/lib/api';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  History,
} from 'lucide-react';

const TIME = ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const rangeHasWeekend = (from: string, to: string) => {
  const d1 = new Date(`${from}T00:00:00`);
  const d2 = new Date(`${to}T00:00:00`);
  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); // 0 Sun, 6 Sat
    if (wd === 0 || wd === 6) return true;
  }
  return false;
};

type RequestRow = {
  id: number;
  kind: 'EXTRA_HOURS' | 'ABSENCE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  date?: string;
  rangeStart?: string;
  rangeEnd?: string;
  reason?: string;
  comment?: string;
  reviewNote?: string;
};

export default function RequestsPage() {
  const {user, loading} = useAuth();

  const [tab, setTab] = useState<'extra' | 'absence'>('extra');
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [start, setStart] = useState('15:00');
  const [end, setEnd] = useState('18:00');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History state
  const [history, setHistory] = useState<RequestRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const t = ymd(new Date());
    setDate(t);
    setFrom(t);
    setTo(t);
  }, []);

  useEffect(() => {
    if (tab === 'absence') setMode('range');
  }, [tab]);

  // Load history on mount
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithAuth('/api/requests/me');
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  const endOpts = useMemo(() => TIME.filter(t => t > start), [start]);
  const minutes = useMemo(() => {
    const toM = (s: string) => {
      const [a, b] = s.split(':').map(Number);
      return a * 60 + b;
    };
    return toM(end) - toM(start);
  }, [start, end]);

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-[400px] text-gray-500">
        Loading...
      </div>
    );

  if (!user)
    return (
      <div className="max-w-md mx-auto my-20 p-8 bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm text-center">
        <p className="mb-6 text-gray-500 dark:text-gray-400">
          Authentication required to access this page
        </p>
        <Link
          href="/login"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors hover:bg-blue-700"
        >
          Login to Continue
        </Link>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);
    setErr(null);

    const modeToSend: 'single' | 'range' = tab === 'absence' ? 'range' : mode;

    if (
      tab === 'extra' &&
      modeToSend === 'range' &&
      rangeHasWeekend(from, to)
    ) {
      setErr(
        'Weekends are not allowed for extra hours. Please adjust the range.',
      );
      setIsSubmitting(false);
      return;
    }

    try {
      const body: any = {
        kind: tab === 'extra' ? 'EXTRA_HOURS' : 'ABSENCE',
        mode: modeToSend,
        reason: tab === 'absence' ? reason || null : null,
        comment: tab === 'absence' ? comment || null : null,
      };
      if (modeToSend === 'single') body.date = date;
      else {
        body.startDate = from;
        body.endDate = to;
      }
      if (tab === 'extra') {
        body.start = start;
        body.end = end;
      }

      const out = await postJson<any>('/api/requests', body);

      if (modeToSend === 'single') {
        if (out?.duplicate) setMsg('Already requested for that date.');
        else if (out?.skippedWeekend) setMsg('Skipped weekend date.');
        else {
          setMsg('Request submitted successfully!');
          loadHistory(); // refresh list
        }
      } else {
        const parts: string[] = [`Created ${out?.created ?? 0} request(s)`];
        if (out?.duplicates) parts.push(`duplicates: ${out.duplicates}`);
        if (out?.skippedWeekend)
          parts.push(`weekends skipped: ${out.skippedWeekend}`);
        setMsg(parts.join(', ') + '.');
        loadHistory(); // refresh list
      }
    } catch (e: any) {
      if (e?.message === 'WEEKEND_NOT_ALLOWED') {
        setErr(
          'Weekends are not allowed for extra hours. Please pick a weekday.',
        );
      } else {
        setErr(e?.message || 'Submission failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-6 font-sans my-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
          Time Off & Extra Hours
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Submit absence requests or log extra working hours
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm mb-8">
        {/* Tab Navigation */}
        <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-1 mb-8">
          <button
            onClick={() => setTab('extra')}
            className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
              tab === 'extra'
                ? 'bg-white dark:bg-[#222] text-blue-600 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Extra Hours
          </button>
          <button
            onClick={() => setTab('absence')}
            className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
              tab === 'absence'
                ? 'bg-white dark:bg-[#222] text-blue-600 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Absence Request
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-6">
          {/* Mode Selection - Only for Extra Hours */}
          {tab === 'extra' && (
            <div>
              <label className="block mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Request Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`flex-1 py-3 px-4 border rounded-lg text-sm font-medium transition-all ${
                    mode === 'single'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1A1A1A] text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Single Day
                </button>
                <button
                  type="button"
                  onClick={() => setMode('range')}
                  className={`flex-1 py-3 px-4 border rounded-lg text-sm font-medium transition-all ${
                    mode === 'range'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1A1A1A] text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Date Range
                </button>
              </div>
            </div>
          )}

          {/* Date Selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 pb-2">
              Date & Time
            </h3>
            <div
              className={`grid gap-6 ${tab === 'absence' || mode === 'range' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}
            >
              {tab === 'absence' ? (
                <>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Start Date
                    </label>
                    <div className="relative">
                      <Calendar
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="date"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        required
                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      End Date
                    </label>
                    <div className="relative">
                      <Calendar
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="date"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        required
                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : mode === 'single' ? (
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      From Date
                    </label>
                    <div className="relative">
                      <Calendar
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="date"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        required
                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      To Date
                    </label>
                    <div className="relative">
                      <Calendar
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="date"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        required
                        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Extra-hours time window */}
          {tab === 'extra' && (
            <div className="bg-gray-50 dark:bg-[#1A1A1A] p-6 rounded-xl border border-gray-100 dark:border-gray-800">
              <label className="block mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Time Period
              </label>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2 text-xs font-medium text-gray-500 uppercase">
                    Start Time
                  </label>
                  <div className="relative">
                    <Clock
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <select
                      value={start}
                      onChange={e => setStart(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                    >
                      {TIME.slice(0, TIME.length - 1).map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block mb-2 text-xs font-medium text-gray-500 uppercase">
                    End Time
                  </label>
                  <div className="relative">
                    <Clock
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <select
                      value={end}
                      onChange={e => setEnd(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                    >
                      {endOpts.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-500 px-4 py-3 bg-white dark:bg-[#111] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span>Planned duration:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.floor(minutes / 60)}h
                  {minutes % 60 ? ` ${minutes % 60}m` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Absence reason + optional comment */}
          {tab === 'absence' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 pb-2">
                Details
              </h3>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Reason for Absence
                </label>
                <div className="relative">
                  <FileText
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value="">Please select a reason</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Vacation">Vacation</option>
                    <option value="Personal Reasons">Personal Reasons</option>
                    <option value="Family Emergency">Family Emergency</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Additional Details (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Provide any additional context or details for your request..."
                  rows={4}
                  className="w-full p-3 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-inherit resize-y min-h-[100px] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* Status Messages */}
          {msg && (
            <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-400 text-sm flex items-start gap-3">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <span>{msg}</span>
            </div>
          )}

          {err && (
            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting
              ? 'Processing...'
              : `Submit ${tab === 'extra' ? 'Extra Hours' : 'Absence'} Request`}
          </button>
        </form>
      </div>

      {/* History Section */}
      <div className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History size={20} className="text-gray-400" /> Request History
          </h2>
          <button
            onClick={loadHistory}
            disabled={historyLoading}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline disabled:opacity-50"
          >
            {historyLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {historyLoading && history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm italic">
            No past requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          r.kind === 'EXTRA_HOURS'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}
                      >
                        {r.kind === 'EXTRA_HOURS' ? 'Extra' : 'Absence'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                      {r.date ||
                        (r.rangeStart
                          ? `${r.rangeStart.slice(0, 10)} → ${r.rangeEnd?.slice(0, 10)}`
                          : '—')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'APPROVED'
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            : r.status === 'REJECTED'
                              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}
                      >
                        {r.status === 'APPROVED' && <CheckCircle2 size={12} />}
                        {r.status === 'REJECTED' && <AlertCircle size={12} />}
                        {r.status === 'PENDING' && <Clock size={12} />}
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs max-w-[200px] truncate">
                      {r.reviewNote || r.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
