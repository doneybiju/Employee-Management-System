// frontend/src/pages/admin/deprovision.tsx
import {useEffect, useRef, useState} from 'react';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  Clock,
  Trash2,
  Settings,
  Mail,
  RefreshCw,
  Check,
  X,
  UserMinus,
  FileX,
  History,
  AlertTriangle,
  Play,
  Bell,
  AlertCircle,
} from 'lucide-react';

/* ========= Types ========= */
type Policy = {
  id: number;
  enabled: boolean;
  delayAmount: number;
  delayUnit: 'days' | 'weeks' | 'months';
  updatedAt?: string;
  lastRunAt?: string | null;
  lastDeleted?: number | null;
  transferTargetEmail?: string | null;
};

type UpcomingItem = {
  internId?: string;
  firstName?: string | null;
  surname?: string | null;
  department?: string | null;
  position?: string | null;
  endDate: string;
  scheduledDelete: string;
  email?: string | null;
  hasAnyDocument?: boolean;
};
type UpcomingResp = {
  windowDays: number;
  delayDays: number;
  items: UpcomingItem[];
  overdue?: UpcomingItem[];
};

/* Document Reminders */
type RemPolicy = {
  enabled: boolean;
  everyDays: number;
  emailEnabled: boolean;
  lastRunAt?: string | null;
  lastSent?: number | null;
  autoPurgeEnabled?: boolean;
  autoPurgeDays?: number;
};
type RemHistoryItem = {
  id?: string | number;
  sentAt: string;
  totalRecipients: number;
  missingBreakdown?: Record<string, number>;
};

type DocPolicy = {
  enabled: boolean;
  delayAmount: number;
  delayUnit: 'days' | 'weeks' | 'months';
  lastRunAt?: string | null;
  lastDeleted?: number | null;
  includeAvatar?: boolean;
  includeProfileImage?: boolean;
};

type DocUpcomingItem = {
  internId: string;
  name: string;
  email: string | null;
  endDate: string;
  deleteAt: string;
  docsCount: number;
  hasProfilePicture: boolean;
  includeAvatarByPolicy: boolean;
};

type DocUpcomingResp = {
  windowDays: number;
  policy: {
    enabled: boolean;
    delayAmount: number;
    delayUnit: string;
    includeAvatar: boolean;
  };
  items: DocUpcomingItem[];
};

/* ========= Utilities ========= */
function fmt(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
function fmtDT(d?: string | null) {
  if (!d) return 'Never';
  const date = new Date(d);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/* ========= Page ========= */
function DeprovisionSettings() {
  const [section, setSection] = useState<'deprov' | 'docdel' | 'reminders'>(
    'deprov',
  );

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2300);
  };

  /* ----- Deprovision state ----- */
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [delayAmount, setDelayAmount] = useState(0);
  const [delayUnit, setDelayUnit] = useState<'days' | 'weeks' | 'months'>(
    'days',
  );
  const [lastRunAt, setLastRunAt] = useState<string | null | undefined>(null);
  const [lastDeleted, setLastDeleted] = useState<number | null | undefined>(0);
  const [transferTargetEmail, setTransferTargetEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingResp | null>(null);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);

  // NEW: Document Deletion (separate delay used for doc cleanup API)
  const [docDelayAmount, setDocDelayAmount] = useState<number>(0);
  const [docDelayUnit, setDocDelayUnit] = useState<'days' | 'weeks' | 'months'>(
    'days',
  );
  const [docRunning, setDocRunning] = useState(false);
  // NEW: toggle + saving state for Document Deletion
  const [docEnabled, setDocEnabled] = useState<boolean>(false);
  const [docSaving, setDocSaving] = useState<boolean>(false);

  const [docIncludeAvatar, setDocIncludeAvatar] = useState<boolean>(false);

  const [docUpcoming, setDocUpcoming] = useState<DocUpcomingResp | null>(null);
  const [loadingDocUpcoming, setLoadingDocUpcoming] = useState(false);

  async function loadPolicy() {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/deprovision/policy', {
        cache: 'no-store' as RequestCache,
      });
      const p: Policy = await res.json();

      setEnabled(!!p.enabled);
      setDelayAmount(p.delayAmount ?? 0);
      setDelayUnit((p.delayUnit as any) ?? 'days');
      setLastRunAt(p.lastRunAt ?? null);
      setLastDeleted(p.lastDeleted ?? 0);

      setTransferEnabled(!!p.transferTargetEmail);
      setTransferTargetEmail(p.transferTargetEmail || '');
    } finally {
      setLoading(false);
    }
  }

  async function toggleTransfer(next: boolean) {
    setTransferEnabled(next);

    if (next) {
      const email = transferTargetEmail.trim();
      if (email) {
        try {
          await saveDeprov({transferTargetEmail: email});
        } catch {
          setTransferEnabled(false);
        }
      } else {
        // keep it enabled so the input becomes editable; just inform the user
        showToast('Type an email to save');
      }
    } else {
      try {
        await saveDeprov({transferTargetEmail: null});
      } catch {
        setTransferEnabled(true);
      }
    }
  }

  async function loadUpcoming() {
    setLoadingUpcoming(true);
    try {
      const res = await fetchWithAuth(
        '/api/deprovision/upcoming?windowDays=7',
        {cache: 'no-store' as RequestCache},
      );
      const data: UpcomingResp = await res.json();
      setUpcoming(data);
    } finally {
      setLoadingUpcoming(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      loadDocPolicy(), // document deletion toggle + avatar flag
      loadRem(), // reminders enabled/disabled + frequency
    ]);
  }, []);

  async function loadDocPolicy() {
    try {
      const res = await fetchWithAuth('/api/deprovision/doc-cleanup/policy', {
        cache: 'no-store' as RequestCache,
      });
      if (!res.ok) return; // keep current UI defaults if backend not ready
      const p: DocPolicy = await res.json();
      setDocEnabled(!!p.enabled);
      setDocDelayAmount(p.delayAmount ?? 0);
      setDocDelayUnit((p.delayUnit as any) ?? 'days');
      setDocIncludeAvatar(
        Boolean((p as any).includeProfileImage ?? (p as any).includeAvatar),
      );
    } catch {
      /* noop */
    }
  }

  async function loadDocUpcoming(windowDays = 30) {
    setLoadingDocUpcoming(true);
    try {
      const res = await fetchWithAuth(
        `/api/deprovision/doc-cleanup/upcoming?windowDays=${windowDays}`,
        {
          cache: 'no-store' as RequestCache,
        },
      );
      if (!res.ok) return;
      setDocUpcoming(await res.json());
    } finally {
      setLoadingDocUpcoming(false);
    }
  }

  async function saveDeprov(
    patch: Partial<
      Pick<
        Policy,
        'enabled' | 'delayAmount' | 'delayUnit' | 'transferTargetEmail'
      >
    >,
  ) {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/deprovision/policy', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      await Promise.all([loadPolicy(), loadUpcoming()]);
    } finally {
      setSaving(false);
    }
  }
  async function toggleDeprov(next: boolean) {
    await saveDeprov({enabled: next});
  }

  function onChangeAmount(v: number) {
    const n = Math.max(0, Math.min(30, Math.trunc(Number(v))));
    setDelayAmount(n);
    const u = n === 0 ? 'days' : delayUnit;
    setDelayUnit(u as any);
    void saveDeprov({delayAmount: n, delayUnit: u as any});
  }
  function onChangeUnit(u: 'days' | 'weeks' | 'months') {
    const unit = delayAmount === 0 ? 'days' : u;
    setDelayUnit(unit);
    void saveDeprov({delayUnit: unit});
  }

  async function runDeprovNow() {
    setRunning(true);
    try {
      const res = await fetchWithAuth('/api/deprovision/run-now', {
        method: 'POST',
        cache: 'no-store' as RequestCache,
      });
      const out = await res.json().catch(() => ({}) as any);
      const stats = {
        deleted: Number(out?.deletedCount || 0),
        att: Number(out?.google?.attempted || 0),
        ok: Number(out?.google?.succeeded || 0),
        fail: Number(out?.google?.failed || 0),
      };
      showToast(
        `Run completed • deleted ${stats.deleted}, transfers ${stats.ok}/${stats.att}, failed ${stats.fail}`,
      );
      await Promise.all([loadPolicy(), loadUpcoming()]);
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'failed'}`);
    } finally {
      setRunning(false);
    }
  }

  const delayText =
    delayAmount === 0
      ? 'Data will be deleted immediately after the end date.'
      : `Data will be deleted ${delayAmount} ${delayUnit.replace(/s$/, '')}${delayAmount === 1 ? '' : 's'} after the end date.`;

  /* ----- Document Reminders state ----- */
  const [rem, setRem] = useState<RemPolicy | null>(null);
  const [remLoading, setRemLoading] = useState(true);
  const [remSaving, setRemSaving] = useState(false);
  const [remRunning, setRemRunning] = useState(false);
  const [history, setHistory] = useState<RemHistoryItem[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState<string>(
    'Documents reminder sent.',
  );

  // Whitelist state
  const [wl, setWl] = useState<any[]>([]);
  const [uQuery, setUQuery] = useState('');
  const [uOpts, setUOpts] = useState<any[]>([]);

  async function loadWhitelist() {
    const r = await fetchWithAuth('/api/reminders/whitelist', {
      cache: 'no-store' as RequestCache,
    });
    if (!r.ok) return setWl([]);
    const j = await r.json();
    setWl(Array.isArray(j?.items) ? j.items : []);
  }
  async function searchUsers(q: string) {
    setUQuery(q);
    if (!q.trim()) return setUOpts([]);
    const r = await fetchWithAuth(
      `/api/users/options?q=${encodeURIComponent(q)}`,
    );
    if (r.ok) setUOpts(await r.json());
  }
  async function addToWhitelist(userId: number) {
    await fetchWithAuth('/api/reminders/whitelist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userId}),
    });
    setUQuery('');
    setUOpts([]);
    loadWhitelist();
  }
  async function removeFromWhitelist(userId: number) {
    await fetchWithAuth(`/api/reminders/whitelist/${userId}`, {
      method: 'DELETE',
    });
    loadWhitelist();
  }

  // Deprovision whitelist
  const [wlDep, setWlDep] = useState<any[]>([]);
  const [depQuery, setDepQuery] = useState('');
  const [depOpts, setDepOpts] = useState<any[]>([]);

  async function loadDeprovWhitelist() {
    const r = await fetchWithAuth('/api/deprovision/whitelist', {
      cache: 'no-store' as RequestCache,
    });
    if (!r.ok) return setWlDep([]);
    const j = await r.json();
    setWlDep(Array.isArray(j?.items) ? j.items : []);
  }
  async function searchUsersDep(q: string) {
    setDepQuery(q);
    if (!q.trim()) return setDepOpts([]);
    const r = await fetchWithAuth(
      `/api/users/options?q=${encodeURIComponent(q)}`,
    );
    if (r.ok) setDepOpts(await r.json());
  }
  async function addToDeprovWhitelist(userId: number) {
    await fetchWithAuth('/api/deprovision/whitelist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userId}),
    });
    setDepQuery('');
    setDepOpts([]);
    loadDeprovWhitelist();
  }
  async function removeFromDeprovWhitelist(userId: number) {
    await fetchWithAuth(`/api/deprovision/whitelist/${userId}`, {
      method: 'DELETE',
    });
    loadDeprovWhitelist();
  }

  async function loadRem() {
    setRemLoading(true);
    try {
      const res = await fetchWithAuth('/api/reminders/policy', {
        cache: 'no-store' as RequestCache,
      });
      if (!res.ok) {
        setRem(null);
        return;
      }
      const data: RemPolicy = await res.json();
      setRem(data);
      setAutoPurgeEnabled(!!data.autoPurgeEnabled);
      if (Number.isFinite(data.autoPurgeDays)) {
        setRetentionMonths(
          Math.max(
            1,
            Math.min(6, Math.round((data.autoPurgeDays as number) / 30)),
          ),
        );
      }
    } catch {
      setRem(null);
    } finally {
      setRemLoading(false);
    }
  }
  async function loadRemHistory() {
    try {
      const res = await fetchWithAuth('/api/reminders/history?limit=20', {
        cache: 'no-store' as RequestCache,
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data?.items) ? data.items : []);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (section === 'reminders') {
      void Promise.all([loadRem(), loadRemHistory(), loadWhitelist()]);
    }
    if (section === 'deprov') {
      void Promise.all([loadPolicy(), loadUpcoming(), loadDeprovWhitelist()]);
    }
    if (section === 'docdel') {
      void loadDocPolicy();
      void loadDocUpcoming(30);
    }
  }, [section]);

  async function saveRem(patch: Partial<RemPolicy>) {
    setRemSaving(true);
    try {
      const res = await fetchWithAuth('/api/reminders/policy', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      });
      if (res.ok) setRem(await res.json());
    } finally {
      setRemSaving(false);
    }
  }

  async function saveDocPolicy(
    patch: Partial<DocPolicy> & {includeProfileImage?: boolean},
  ) {
    setDocSaving(true);

    try {
      const res = await fetchWithAuth('/api/deprovision/doc-cleanup/policy', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      // Use server response to sync UI (avoids quick flip back)
      setDocEnabled(!!j.enabled);
      setDocDelayAmount(j.delayAmount ?? 0);
      setDocDelayUnit((j.delayUnit as any) ?? 'days');
      setDocIncludeAvatar(Boolean(j.includeAvatar ?? j.includeProfileImage));

      setDocIncludeAvatar(prev =>
        'includeAvatar' in j || 'includeProfileImage' in j
          ? Boolean(j.includeAvatar ?? j.includeProfileImage)
          : prev,
      );
    } finally {
      setDocSaving(false);
    }
  }

  async function runDocCleanupNow() {
    setDocRunning(true);
    try {
      const res = await fetchWithAuth('/api/deprovision/doc-cleanup/run-now', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ignoreDelay: true,
          includeAvatar: docIncludeAvatar,
          includeProfileImage: docIncludeAvatar,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      showToast(
        `Deleted docs: ${j?.deletedDocs ?? 0}` +
          (typeof j?.avatarDeleted === 'number'
            ? ` • avatars: ${j.avatarDeleted}`
            : ''),
      );
    } catch (e: any) {
      showToast(e?.message || 'Document delete failed');
    } finally {
      setDocRunning(false);
    }
  }

  async function toggleDoc(next: boolean) {
    const prev = docEnabled;
    setDocEnabled(next);
    try {
      await saveDocPolicy({enabled: next});
    } catch (e: any) {
      setDocEnabled(prev); // revert on failure
      showToast(e?.message || 'Save failed');
    }
  }

  function onDocChangeAmount(v: number) {
    const n = Math.max(0, Math.min(30, Math.trunc(Number(v))));
    const unit = n === 0 ? 'days' : docDelayUnit;
    setDocDelayAmount(n);
    setDocDelayUnit(unit);
    void saveDocPolicy({delayAmount: n, delayUnit: unit});
  }

  function onDocChangeUnit(u: 'days' | 'weeks' | 'months') {
    const unit = docDelayAmount === 0 ? 'days' : u;
    setDocDelayUnit(unit);
    void saveDocPolicy({delayUnit: unit});
  }

  // Retention (months → days)
  const [retentionMonths, setRetentionMonths] = useState<number>(1);
  const retentionDays = Math.max(30, Math.min(180, retentionMonths * 30));
  const [autoPurgeEnabled, setAutoPurgeEnabled] = useState<boolean>(false);

  async function deleteAllReminders() {
    try {
      const res = await fetchWithAuth('/api/reminders/purge', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        // Try both signals for “all”: olderThanDays: 0 and forceAll: true
        body: JSON.stringify({
          olderThanDays: 0,
          applyTo: 'both',
          forceAll: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      showToast(
        `Deleted • Inbox: ${j?.deleted?.inbox ?? 0} • History: ${j?.deleted?.history ?? 0}`,
      );
      if (section === 'reminders') {
        void loadRemHistory();
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'delete all failed'}`);
    }
  }

  async function purgeReminders(
    applyTo: 'inbox' | 'history' | 'both' = 'both',
  ) {
    try {
      const res = await fetchWithAuth('/api/reminders/purge', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({olderThanDays: retentionDays, applyTo}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      showToast(
        `Deleted • Inbox: ${j?.deleted?.inbox ?? 0} • History: ${j?.deleted?.history ?? 0}`,
      );
      if (section === 'reminders') {
        void loadRemHistory();
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'purge failed'}`);
    }
  }

  async function saveAutoPurgeSettings() {
    const body = {autoPurgeEnabled, autoPurgeDays: retentionDays};
    try {
      await fetchWithAuth('/api/reminders/policy', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      showToast('Auto-delete settings saved');
      await loadRem();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save auto-delete');
    }
  }

  async function runRemNow() {
    setRemRunning(true);
    try {
      const res = await fetchWithAuth('/api/reminders/run-now', {
        method: 'POST',
      });
      const j = await res.json().catch(() => ({}));
      const sent = Number(j?.sent ?? j?.totalRecipients ?? 0);
      setNoticeMsg(`Reminder queued. Emails to send: ${sent}`);
      setNoticeOpen(true);
      showToast(`Reminders sent: ${sent}`);
      await Promise.all([loadRem(), loadRemHistory()]);
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'failed'}`);
    } finally {
      setRemRunning(false);
    }
  }

  /* ========= Render ========= */
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-50 bg-[#111] text-white px-4 py-2.5 rounded-lg shadow-xl animate-fade-in"
        >
          {toast}
        </div>
      )}

      {/* Bottom notification bar for "Send now" */}
      {noticeOpen && (
        <div className="fixed left-1/2 bottom-5 -translate-x-1/2 w-[min(94vw,640px)] bg-white dark:bg-[#1A1A1A] rounded-xl p-4 flex gap-3 items-center shadow-2xl z-50 border border-gray-100 dark:border-gray-800">
          <div className="w-10 h-10 rounded-full grid place-items-center bg-amber-100 text-amber-600 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-800 dark:text-gray-100">
              Document Reminder
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {noticeMsg}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              onClick={() => setNoticeOpen(false)}
            >
              Dismiss
            </button>
            <a
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              href="/admin/document-management"
            >
              Open Docs
            </a>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-72 bg-white dark:bg-[#111] border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Settings size={20} />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Cron Manager
            </h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Manage automated tasks and policies
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Deprovisioning */}
          <button
            onClick={() => setSection('deprov')}
            className={`w-full text-left p-3 rounded-xl transition-all border ${
              section === 'deprov'
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30'
                : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3 mb-1">
              <UserMinus
                size={18}
                className={
                  section === 'deprov'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400'
                }
              />
              <span
                className={`font-medium ${
                  section === 'deprov'
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                Deprovisioning
              </span>
            </div>
            <p className="text-xs text-gray-500 pl-8">
              Account removal automation
            </p>
          </button>

          {/* Document Deletion */}
          <button
            onClick={() => setSection('docdel')}
            className={`w-full text-left p-3 rounded-xl transition-all border ${
              section === 'docdel'
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30'
                : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3 mb-1">
              <FileX
                size={18}
                className={
                  section === 'docdel'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400'
                }
              />
              <span
                className={`font-medium ${
                  section === 'docdel'
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                Document Cleanup
              </span>
            </div>
            <p className="text-xs text-gray-500 pl-8">
              Expired document purging
            </p>
          </button>

          {/* Reminders */}
          <button
            onClick={() => setSection('reminders')}
            className={`w-full text-left p-3 rounded-xl transition-all border ${
              section === 'reminders'
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30'
                : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3 mb-1">
              <Bell
                size={18}
                className={
                  section === 'reminders'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400'
                }
              />
              <span
                className={`font-medium ${
                  section === 'reminders'
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                Reminders
              </span>
            </div>
            <p className="text-xs text-gray-500 pl-8">
              Missing document notifications
            </p>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto pb-12">
          {section === 'deprov' && (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Deprovisioning
                  </h2>
                  <p className="text-gray-500 mt-1">
                    Manage automatic account deprovisioning policies.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
                    <button
                      onClick={() => toggleDeprov(true)}
                      disabled={enabled || saving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        enabled
                          ? 'bg-white dark:bg-[#222] text-green-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => toggleDeprov(false)}
                      disabled={!enabled || saving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        !enabled
                          ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Paused
                    </button>
                  </div>
                  <button
                    onClick={runDeprovNow}
                    disabled={running || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {running ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    {running ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Clock size={24} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Last Run
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {fmtDT(lastRunAt)}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Deleted Last Run
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {lastDeleted ?? 0}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                      enabled
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {enabled ? <Check size={24} /> : <X size={24} />}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Status
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        enabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {enabled ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 flex items-center justify-center shrink-0">
                    {running ? (
                      <RefreshCw size={24} className="animate-spin" />
                    ) : (
                      <Settings size={24} />
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Worker State
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {loading
                        ? 'Loading...'
                        : saving
                          ? 'Saving...'
                          : running
                            ? 'Running...'
                            : 'Idle'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Delete Delay Amount
                    </label>
                    <select
                      value={delayAmount}
                      onChange={e =>
                        onChangeAmount(parseInt(e.target.value, 10))
                      }
                      disabled={loading || saving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      {Array.from({length: 31}, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Time Unit
                    </label>
                    <select
                      value={delayUnit}
                      onChange={e => onChangeUnit(e.target.value as any)}
                      disabled={delayAmount === 0 || loading || saving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all disabled:opacity-50"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-5 mt-1">
                      <input
                        id="transfer-toggle"
                        type="checkbox"
                        checked={transferEnabled}
                        onChange={e => toggleTransfer(e.target.checked)}
                        disabled={loading || saving}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="transfer-toggle"
                        className="font-medium text-gray-900 dark:text-white"
                      >
                        Drive Files Transfer
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Transfer private Google Drive files to a manager before
                        deletion.
                      </p>
                      {transferEnabled && (
                        <div className="mt-3">
                          <input
                            type="email"
                            placeholder="manager@extramus.eu"
                            value={transferTargetEmail}
                            onChange={e =>
                              setTransferTargetEmail(e.target.value)
                            }
                            onBlur={() => {
                              if (transferEnabled) {
                                void saveDeprov({
                                  transferTargetEmail:
                                    transferTargetEmail.trim() || '',
                                });
                              }
                            }}
                            disabled={!transferEnabled || loading || saving}
                            className="w-full max-w-md bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-200 p-4 rounded-lg text-sm flex gap-3 items-start">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-1">
                      Policy Summary
                    </span>
                    {delayText}
                  </div>
                </div>
              </div>

              {/* Upcoming Table */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Upcoming Deprovisioning (Next 7 Days)
                  </h3>
                  <p className="text-sm text-gray-500">
                    Interns scheduled for deletion based on the current delay
                    policy.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Name
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Department
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          End Date
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Scheduled Delete
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {loadingUpcoming ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-gray-500"
                          >
                            Loading...
                          </td>
                        </tr>
                      ) : (upcoming?.items ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-gray-500"
                          >
                            No records found.
                          </td>
                        </tr>
                      ) : (
                        upcoming!.items.map((it, idx) => (
                          <tr
                            key={idx}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-6 text-sm text-gray-900 dark:text-gray-100 font-medium">
                              {[it.firstName, it.surname]
                                .filter(Boolean)
                                .join(' ') ||
                                it.email ||
                                (it.internId != null
                                  ? `ID ${it.internId}`
                                  : '-')}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {it.department ?? '-'}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {fmt(it.endDate)}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {fmt(it.scheduledDelete)}
                            </td>
                            <td className="p-6 text-sm text-gray-500 dark:text-gray-400">
                              {it.email ?? '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Overdue Table */}
              {Boolean(upcoming?.overdue?.length) && (
                <div className="bg-white dark:bg-[#111] border border-red-200 dark:border-red-900/30 rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-red-100 dark:border-red-900/20 bg-red-50/30 dark:bg-red-900/10">
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle size={20} />
                      Overdue Deprovisioning
                    </h3>
                    <p className="text-sm text-red-600/80 dark:text-red-400/70">
                      These users’ scheduled delete date has passed. Check
                      system logs.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                        <tr>
                          <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                            Name
                          </th>
                          <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                            Department
                          </th>
                          <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                            End Date
                          </th>
                          <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                            Scheduled Delete
                          </th>
                          <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                            Email
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {upcoming!.overdue!.map((it, idx) => (
                          <tr
                            key={`od-${idx}`}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-6 text-sm text-gray-900 dark:text-gray-100 font-medium">
                              {[it.firstName, it.surname]
                                .filter(Boolean)
                                .join(' ') ||
                                it.email ||
                                (it.internId != null
                                  ? `ID ${it.internId}`
                                  : '-')}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {it.department ?? '-'}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {fmt(it.endDate)}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {fmt(it.scheduledDelete)}
                            </td>
                            <td className="p-6 text-sm text-gray-500 dark:text-gray-400">
                              {it.email ?? '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Whitelist */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Deprovision Whitelist
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Users here will NOT be deleted when their end date is
                    reached.
                  </p>
                </div>

                <div className="mb-6 space-y-3">
                  <div className="relative">
                    <input
                      placeholder="Search users to whitelist..."
                      value={depQuery}
                      onChange={e => void searchUsersDep(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 pl-4 pr-4 transition-all"
                    />
                  </div>
                  {depOpts.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-[#1A1A1A] rounded-lg border border-gray-100 dark:border-gray-800">
                      {depOpts.slice(0, 6).map(u => (
                        <button
                          key={u.id}
                          onClick={() => addToDeprovWhitelist(u.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:border-blue-500 hover:text-blue-600 transition-colors shadow-sm"
                        >
                          <span>
                            {u.firstName} {u.surname}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({u.role})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          User
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Email
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Role
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {wlDep.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-gray-500"
                          >
                            No whitelist entries.
                          </td>
                        </tr>
                      ) : (
                        wlDep.map((w: any) => (
                          <tr
                            key={w.user.id}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-4 text-sm font-medium text-gray-900 dark:text-white">
                              {w.user.firstName} {w.user.surname}
                              <span className="text-gray-500 font-normal ml-2">
                                • {w.user.empId}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                              {w.user.companyEmail}
                            </td>
                            <td className="p-4 text-sm text-gray-600 dark:text-gray-400 capitalize">
                              {w.user.role}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() =>
                                  removeFromDeprovWhitelist(w.user.id)
                                }
                                className="text-red-600 hover:text-red-700 font-medium text-sm hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'docdel' && (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Document Cleanup
                  </h2>
                  <p className="text-gray-500 mt-1">
                    Automatically delete documents after a set period.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
                    <button
                      onClick={() => toggleDoc(true)}
                      disabled={docEnabled || docSaving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        docEnabled
                          ? 'bg-white dark:bg-[#222] text-green-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => toggleDoc(false)}
                      disabled={!docEnabled || docSaving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        !docEnabled
                          ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Paused
                    </button>
                  </div>
                  <button
                    onClick={runDocCleanupNow}
                    disabled={docRunning}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {docRunning ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    {docRunning ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              </div>

              {/* Settings */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Deletion Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Delete After
                    </label>
                    <select
                      value={docDelayAmount}
                      onChange={e =>
                        onDocChangeAmount(parseInt(e.target.value || '0', 10))
                      }
                      disabled={docSaving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      {Array.from({length: 31}, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Time Unit
                    </label>
                    <select
                      value={docDelayUnit}
                      onChange={e => onDocChangeUnit(e.target.value as any)}
                      disabled={docDelayAmount === 0 || docSaving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all disabled:opacity-50"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-5 mt-1">
                      <input
                        id="avatar-toggle"
                        type="checkbox"
                        checked={docIncludeAvatar}
                        onChange={async e => {
                          const checked = e.target.checked;
                          setDocIncludeAvatar(checked); // optimistic
                          try {
                            await saveDocPolicy({
                              includeAvatar: checked,
                              includeProfileImage: checked,
                            });
                          } catch {
                            setDocIncludeAvatar(!checked);
                          }
                        }}
                        disabled={docSaving}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="avatar-toggle"
                        className="font-medium text-gray-900 dark:text-white"
                      >
                        Include Profile Image
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        If checked, user avatars will also be deleted along with
                        documents.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-200 p-4 rounded-lg text-sm flex gap-3 items-start">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-1">
                      Policy Summary
                    </span>
                    {docDelayAmount === 0
                      ? 'Documents will be deleted immediately after the end date.'
                      : `Documents will be deleted ${docDelayAmount} ${docDelayUnit.replace(/s$/, '')}${docDelayAmount === 1 ? '' : 's'} after the end date.`}
                  </div>
                </div>
              </div>

              {/* Upcoming Table */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Upcoming Deletions (Next 30 Days)
                    </h3>
                    <p className="text-sm text-gray-500">
                      Based on End Date + delay.
                    </p>
                  </div>
                  <button
                    onClick={() => loadDocUpcoming(30)}
                    disabled={loadingDocUpcoming}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={loadingDocUpcoming ? 'animate-spin' : ''}
                    />
                    Refresh
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Intern
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Email
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          End Date
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Delete On
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Docs
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Profile Pic
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {!docUpcoming || docUpcoming.items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-8 text-center text-gray-500"
                          >
                            No upcoming document deletions.
                          </td>
                        </tr>
                      ) : (
                        docUpcoming.items.map(it => (
                          <tr
                            key={it.internId}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-6 text-sm font-medium text-gray-900 dark:text-white">
                              {it.name}
                            </td>
                            <td className="p-6 text-sm text-gray-500 dark:text-gray-400">
                              {it.email ?? '—'}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(it.endDate).toLocaleDateString()}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(it.deleteAt).toLocaleDateString()}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {it.docsCount}
                            </td>
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {it.hasProfilePicture ? (
                                it.includeAvatarByPolicy ? (
                                  <span className="text-red-600 dark:text-red-400 font-medium">
                                    Will delete
                                  </span>
                                ) : (
                                  <span className="text-gray-500">
                                    Exists (policy OFF)
                                  </span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {section === 'reminders' && (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Document Reminders
                  </h2>
                  <p className="text-gray-500 mt-1">
                    Configure notifications for missing required documents.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
                    <button
                      onClick={() => saveRem({enabled: true})}
                      disabled={rem?.enabled || remSaving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        rem?.enabled
                          ? 'bg-white dark:bg-[#222] text-green-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => saveRem({enabled: false})}
                      disabled={!rem?.enabled || remSaving}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        !rem?.enabled
                          ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      Paused
                    </button>
                  </div>
                  <button
                    onClick={runRemNow}
                    disabled={remRunning || remLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {remRunning ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Mail size={16} />
                    )}
                    {remRunning ? 'Sending...' : 'Send Now'}
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                      rem?.enabled
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {rem?.enabled ? <Check size={24} /> : <X size={24} />}
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Status
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        rem?.enabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {rem?.enabled ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Clock size={24} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Frequency
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      Every {rem?.everyDays ?? 7} Days
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 flex items-center justify-center shrink-0">
                    <Mail size={24} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Email
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {rem?.emailEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#111] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <History size={24} />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      Last Run
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {fmtDT(rem?.lastRunAt)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Reminder Policy
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Enabled
                    </label>
                    <select
                      value={rem?.enabled ? '1' : '0'}
                      onChange={e => saveRem({enabled: e.target.value === '1'})}
                      disabled={remSaving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Every
                    </label>
                    <select
                      value={rem?.everyDays ?? 7}
                      onChange={e =>
                        saveRem({everyDays: parseInt(e.target.value, 10) || 7})
                      }
                      disabled={remSaving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      {[3, 5, 7, 10, 14, 21, 28].map(n => (
                        <option key={n} value={n}>
                          {n} days
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Email Notifications
                    </label>
                    <select
                      value={rem?.emailEnabled ? '1' : '0'}
                      onChange={e =>
                        saveRem({emailEnabled: e.target.value === '1'})
                      }
                      disabled={remSaving}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      <option value="1">Enabled</option>
                      <option value="0">Disabled</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* History Retention */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  History Retention
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Manage retention of reminder logs (Inbox & Send History).
                </p>

                <div className="flex flex-col md:flex-row items-end gap-4">
                  <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Keep history for
                    </label>
                    <select
                      value={retentionMonths}
                      onChange={e =>
                        setRetentionMonths(parseInt(e.target.value, 10))
                      }
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 px-3 transition-all"
                    >
                      {[1, 2, 3, 4, 5, 6].map(m => (
                        <option key={m} value={m}>
                          {m} month{m === 1 ? '' : 's'} ({m * 30} days)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button
                      onClick={() => purgeReminders('both')}
                      className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      Delete Older
                    </button>
                    <button
                      onClick={deleteAllReminders}
                      className="px-4 py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Delete All
                    </button>
                    <button
                      onClick={saveAutoPurgeSettings}
                      className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Save Settings
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="auto-purge"
                    checked={autoPurgeEnabled}
                    onChange={e => setAutoPurgeEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="auto-purge"
                    className="text-sm text-gray-700 dark:text-gray-300"
                  >
                    Enable automatic daily cleanup (server-side)
                  </label>
                </div>
              </div>

              {/* Whitelist */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Reminder Whitelist
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Users here will NOT receive document reminders.
                  </p>
                </div>

                <div className="mb-6 space-y-3">
                  <div className="relative">
                    <input
                      placeholder="Search users to whitelist..."
                      value={uQuery}
                      onChange={e => void searchUsers(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg py-2.5 pl-4 pr-4 transition-all"
                    />
                  </div>
                  {uOpts.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-[#1A1A1A] rounded-lg border border-gray-100 dark:border-gray-800">
                      {uOpts.slice(0, 6).map(u => (
                        <button
                          key={u.id}
                          onClick={() => addToWhitelist(u.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:border-blue-500 hover:text-blue-600 transition-colors shadow-sm"
                        >
                          <span>
                            {u.firstName} {u.surname}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({u.role})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          User
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Email
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Role
                        </th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {wl.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-gray-500"
                          >
                            No whitelist entries.
                          </td>
                        </tr>
                      ) : (
                        wl.map((w: any) => (
                          <tr
                            key={w.user.id}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-4 text-sm font-medium text-gray-900 dark:text-white">
                              {w.user.firstName} {w.user.surname}
                              <span className="text-gray-500 font-normal ml-2">
                                • {w.user.empId}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-gray-600 dark:text-gray-400">
                              {w.user.companyEmail}
                            </td>
                            <td className="p-4 text-sm text-gray-600 dark:text-gray-400 capitalize">
                              {w.user.role}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => removeFromWhitelist(w.user.id)}
                                className="text-red-600 hover:text-red-700 font-medium text-sm hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* History Table */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Send History
                  </h3>
                  <p className="text-sm text-gray-500">Recent reminder runs.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 dark:bg-[#111] sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Sent At
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Recipients
                        </th>
                        <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                          Breakdown
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {history.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="p-8 text-center text-gray-500"
                          >
                            No history yet.
                          </td>
                        </tr>
                      ) : (
                        history.map((h, i) => (
                          <tr
                            key={h.id ?? i}
                            className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <td className="p-6 text-sm text-gray-700 dark:text-gray-300">
                              {fmtDT(h.sentAt)}
                            </td>
                            <td className="p-6 text-sm font-medium text-gray-900 dark:text-white">
                              {h.totalRecipients}
                            </td>
                            <td className="p-6 text-sm text-gray-500 dark:text-gray-400">
                              {h.missingBreakdown
                                ? Object.entries(h.missingBreakdown)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(' • ')
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <DeprovisionSettings />
    </ProtectedRoute>
  );
}
