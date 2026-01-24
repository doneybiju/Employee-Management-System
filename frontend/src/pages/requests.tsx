// frontend/src/pages/requests.tsx
import {useAuth} from '@/context/AuthContext';
import {postJson} from '@/lib/api';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';

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

  useEffect(() => {
    const t = ymd(new Date());
    setDate(t);
    setFrom(t);
    setTo(t);
  }, []);

  useEffect(() => {
    if (tab === 'absence') setMode('range');
  }, [tab]);

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
        else setMsg('Request submitted successfully!');
      } else {
        const parts: string[] = [`Created ${out?.created ?? 0} request(s)`];
        if (out?.duplicates) parts.push(`duplicates: ${out.duplicates}`);
        if (out?.skippedWeekend)
          parts.push(`weekends skipped: ${out.skippedWeekend}`);
        setMsg(parts.join(', ') + '.');
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
    <main className="max-w-[600px] mx-auto p-4 font-sans my-8">
      {/* Header */}
      <div className="bg-white rounded-xl p-8 mb-6 shadow-sm">
        <h1 className="m-0 mb-2 text-2xl font-bold text-gray-800">
          Time Off & Extra Hours
        </h1>
        <p className="m-0 text-gray-500 text-base">
          Submit absence requests or log extra working hours
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl p-8 shadow-sm">
        {/* Tab Navigation */}
        <div className="flex bg-slate-50 rounded-lg p-1 mb-8">
          <button
            onClick={() => setTab('extra')}
            className={`flex-1 py-3 px-4 rounded-md font-medium border-none cursor-pointer transition-all ${
              tab === 'extra'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'bg-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Extra Hours
          </button>
          <button
            onClick={() => setTab('absence')}
            className={`flex-1 py-3 px-4 rounded-md font-medium border-none cursor-pointer transition-all ${
              tab === 'absence'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'bg-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Absence Request
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-6">
          {/* Mode Selection - Only for Extra Hours */}
          {tab === 'extra' && (
            <div>
              <label className="block mb-3 text-sm font-medium text-gray-700">
                Request Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`flex-1 py-3 px-4 border-2 rounded-lg font-medium cursor-pointer transition-all ${
                    mode === 'single'
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Single Day
                </button>
                <button
                  type="button"
                  onClick={() => setMode('range')}
                  className={`flex-1 py-3 px-4 border-2 rounded-lg font-medium cursor-pointer transition-all ${
                    mode === 'range'
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Date Range
                </button>
              </div>
            </div>
          )}

          {/* Date Selection */}
          <div
            className={`grid gap-4 ${tab === 'absence' || mode === 'range' ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {tab === 'absence' ? (
              <>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </>
            ) : mode === 'single' ? (
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full p-3 border border-gray-300 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg text-base transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </>
            )}
          </div>

          {/* Extra-hours time window */}
          {tab === 'extra' && (
            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
              <label className="block mb-4 text-sm font-medium text-gray-700">
                Time Period
              </label>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Start Time
                  </label>
                  <select
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  >
                    {TIME.slice(0, TIME.length - 1).map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    End Time
                  </label>
                  <select
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  >
                    {endOpts.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-sm text-gray-500 px-3 py-2 bg-white rounded-md border border-gray-200">
                Planned duration:{' '}
                <span className="font-semibold text-gray-800">
                  {Math.floor(minutes / 60)}h
                  {minutes % 60 ? ` ${minutes % 60}m` : ''}
                </span>{' '}
                ({start} – {end})
              </div>
            </div>
          )}

          {/* Absence reason + optional comment */}
          {tab === 'absence' && (
            <>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Reason for Absence
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                  className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                >
                  <option value="">Please select a reason</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Vacation">Vacation</option>
                  <option value="Personal Reasons">Personal Reasons</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Additional Details (Optional)
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Provide any additional context or details for your request..."
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-lg text-base font-inherit resize-y min-h-[100px] transition-colors focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </>
          )}

          {/* Status Messages */}
          {msg && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              {msg}
            </div>
          )}

          {err && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {err}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-6 bg-blue-600 text-white border-none rounded-lg text-base font-semibold cursor-pointer transition-colors mt-2 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? 'Processing...'
              : `Submit ${tab === 'extra' ? 'Extra Hours' : 'Absence'} Request`}
          </button>
        </form>
      </div>
    </main>
  );
}
