// frontend/src/pages/admin/deprovision.tsx
import {useEffect, useRef, useState} from 'react';
import styles from './deprovision.module.css';
import {fetchWithAuth} from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
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
  const emailRef = useRef<HTMLInputElement | null>(null);

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

  function isEmail(v: string) {
    return /\S+@\S+\.\S+/.test(v.trim());
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
    <div className={styles.wrapper}>
      {/* toast */}
      {toast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
            background: '#111',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Bottom notification bar for "Send now" */}
      {noticeOpen && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 20,
            transform: 'translateX(-50%)',
            width: 'min(94vw, 640px)',
            background: '#fff',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            boxShadow: '0 12px 30px rgba(0,0,0,.18)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: '#fef3c7',
              color: '#d97706',
              flexShrink: 0,
            }}
          >
            !
          </div>
          <div style={{flex: 1}}>
            <div style={{fontWeight: 600, color: '#2c3e50'}}>
              Document Reminder
            </div>
            <div style={{color: '#6b7280', fontSize: 14}}>{noticeMsg}</div>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button
              className={styles.btn}
              style={{background: '#f3f4f6', color: '#374151', border: 'none'}}
              onClick={() => setNoticeOpen(false)}
            >
              Dismiss
            </button>
            <a
              className={styles.btn}
              style={{
                background: '#4a6cf7',
                color: '#fff',
                border: 'none',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              href="/admin/document-management"
            >
              Open Docs
            </a>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={styles.navbar}>
        <div className={styles.navHeader}>
          <div className={styles.navTitle}>
            <span>⚙️</span>
            <span>Cron Manager</span>
          </div>
          <div className={styles.navDesc}>
            Manage all your scheduled tasks in one place
          </div>
        </div>

        <div className={styles.navItems}>
          {/* Intern Deprovisioning */}
          <div
            className={`${styles.navItem} ${section === 'deprov' ? styles.active : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setSection('deprov')}
          >
            <div className={styles.itemTitle}>
              <span>👩‍🎓</span>
              <span> Deprovisioning</span>
            </div>
            <div className={styles.itemDesc}>Manage account deprovisioning</div>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={e => {
                  e.stopPropagation();
                  runDeprovNow();
                }}
                disabled={running || loading}
              >
                {running ? 'Running…' : 'Run Now'}
              </button>
              {enabled ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={e => {
                    e.stopPropagation();
                    toggleDeprov(false);
                  }}
                  disabled={saving || loading}
                >
                  ✓ Enabled
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={e => {
                    e.stopPropagation();
                    toggleDeprov(true);
                  }}
                  disabled={saving || loading}
                >
                  ✕ Disabled
                </button>
              )}
            </div>
          </div>

          {/* NEW: Document Deletion */}
          <div
            className={`${styles.navItem} ${section === 'docdel' ? styles.active : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setSection('docdel')}
          >
            <div className={styles.itemTitle}>
              <span>🧹</span>
              <span>Document Deletion</span>
            </div>
            <div className={styles.itemDesc}>
              Auto-delete docs after end date
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={e => {
                  e.stopPropagation();
                  runDocCleanupNow();
                }}
                disabled={docRunning || !docEnabled}
              >
                {docRunning ? 'Running…' : 'Run Now'}
              </button>
              {docEnabled ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={e => {
                    e.stopPropagation();
                    toggleDoc(false);
                  }}
                  disabled={docSaving}
                >
                  ✓ Enabled
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={e => {
                    e.stopPropagation();
                    toggleDoc(true);
                  }}
                  disabled={docSaving}
                >
                  ✕ Disabled
                </button>
              )}
            </div>
          </div>

          {/* Document Reminders */}
          <div
            className={`${styles.navItem} ${section === 'reminders' ? styles.active : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setSection('reminders')}
          >
            <div className={styles.itemTitle}>
              <span>📨</span>
              <span>Document Reminders</span>
            </div>
            <div className={styles.itemDesc}>
              Send & schedule missing-doc notifications
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={e => {
                  e.stopPropagation();
                  runRemNow();
                }}
                disabled={remRunning || remLoading}
              >
                {remRunning ? 'Sending…' : 'Send now'}
              </button>

              {remLoading ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  disabled
                >
                  Loading…
                </button>
              ) : rem?.enabled ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={e => {
                    e.stopPropagation();
                    saveRem({enabled: false});
                  }}
                  disabled={remSaving}
                >
                  ✓ Enabled
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={e => {
                    e.stopPropagation();
                    saveRem({enabled: true});
                  }}
                  disabled={remSaving}
                >
                  ✕ Disabled
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Right content */}
      <main className={styles.content}>
        {section === 'deprov' ? (
          <>
            <div className={styles.contentHeader}>
              <h1 className={styles.contentTitle}> Deprovisioning</h1>
              <p className={styles.contentDesc}>
                Manage account deprovisioning settings and delayed delete
                options.
              </p>
            </div>

            <section className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-[#2c3e50]">
                Deprovisioning Settings
              </h2>

              <div className={styles.statusBar}>
                <div className={styles.statusGrid}>
                  <div className={styles.statusItem}>
                    <span className={`${styles.statusIcon} ${styles.iconSky}`}>
                      <i>⏳</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Last run</div>
                      <div className={styles.statusValue}>
                        {fmtDT(lastRunAt)}
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span
                      className={`${styles.statusIcon} ${styles.iconAmber}`}
                    >
                      <i>🗑</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Deleted last run</div>
                      <div className={styles.statusValue}>
                        {lastDeleted ?? 0} account
                        {(lastDeleted ?? 0) === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span
                      className={`${styles.statusIcon} ${styles.iconEmerald}`}
                    >
                      <i>✓</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Status</div>
                      <span
                        className={`${styles.badge} ${enabled ? styles.badgeActive : styles.badgeInactive}`}
                      >
                        {enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span className={`${styles.statusIcon} ${styles.iconGray}`}>
                      <i>⚙</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Worker</div>
                      <div className={styles.statusValue}>
                        {loading
                          ? 'Loading…'
                          : saving
                            ? 'Saving…'
                            : running
                              ? 'Running…'
                              : 'Idle'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[#f8f9fa] p-4">
                <div className="text-base font-medium text-[#2c3e50] mb-3">
                  Delayed Delete Option
                </div>

                <div className={styles.fieldRow}>
                  <label>
                    <div className="text-sm text-gray-600 mb-1">
                      Delete after
                    </div>
                    <select
                      className={styles.select}
                      value={delayAmount}
                      onChange={e =>
                        onChangeAmount(parseInt(e.target.value, 10))
                      }
                      disabled={loading || saving}
                    >
                      {Array.from({length: 31}, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-sm text-gray-600 mb-1">Time unit</div>
                    <select
                      className={styles.select}
                      value={delayUnit}
                      onChange={e => onChangeUnit(e.target.value as any)}
                      disabled={delayAmount === 0 || loading || saving}
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </label>
                </div>

                <div className="block mt-3">
                  <div className="text-sm text-gray-600 mb-1">
                    Transfer Drive files
                  </div>

                  <div className={styles.inlineRow}>
                    <input
                      id="transfer-toggle"
                      className={styles.toggle}
                      type="checkbox"
                      checked={transferEnabled}
                      onChange={e => toggleTransfer(e.target.checked)}
                      disabled={loading || saving}
                    />
                    <label
                      htmlFor="transfer-toggle"
                      className={styles.inlineRowLabel}
                    >
                      Enable transfer of Drive files to:
                    </label>
                  </div>

                  <input
                    className={styles.input}
                    type="email"
                    placeholder="manager@extramus.eu"
                    value={transferTargetEmail}
                    onChange={e => setTransferTargetEmail(e.target.value)}
                    onBlur={() => {
                      if (transferEnabled) {
                        void saveDeprov({
                          transferTargetEmail: transferTargetEmail.trim() || '',
                        });
                      }
                    }}
                    disabled={!transferEnabled || loading || saving}
                  />

                  <div className="text-xs text-gray-500 mt-1">
                    {transferEnabled
                      ? 'PRIVATE Drive files will be transferred here before deletion.'
                      : 'Disabled — files will NOT be transferred on deprovision.'}
                  </div>
                </div>

                <div className={styles.info}>{delayText}</div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.tableCard}`}>
              <h2 className="text-lg font-semibold text-[#2c3e50]">
                Upcoming Deprovisioning
              </h2>
              <p className="text-sm text-gray-600">
                Interns whose end date is in the next 7 days. Scheduled date
                includes the delay.
              </p>

              {loadingUpcoming ? (
                <div className="mt-3 text-sm text-gray-600">Loading…</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Name</th>
                      <th className={styles.th}>Department</th>
                      <th className={styles.th}>End Date</th>
                      <th className={styles.th}>Scheduled Delete</th>
                      <th className={styles.th}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(upcoming?.items ?? []).length === 0 ? (
                      <tr>
                        <td className={styles.td} colSpan={5}>
                          No records in the next 7 days.
                        </td>
                      </tr>
                    ) : (
                      upcoming!.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className={styles.td}>
                            {[it.firstName, it.surname]
                              .filter(Boolean)
                              .join(' ') ||
                              it.email ||
                              (it.internId != null ? `ID ${it.internId}` : '-')}
                          </td>
                          <td className={styles.td}>{it.department ?? '-'}</td>
                          <td className={styles.td}>{fmt(it.endDate)}</td>
                          <td className={styles.td}>
                            {fmt(it.scheduledDelete)}
                          </td>
                          <td className={styles.td}>{it.email ?? '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {Boolean(upcoming?.overdue?.length) && (
                <div style={{marginTop: 16}}>
                  <h2 className="text-lg font-semibold text-[#2c3e50]">
                    Overdue Deprovisioning
                  </h2>
                  <p className="text-sm text-gray-600">
                    These users’ scheduled delete date has already passed (not
                    whitelisted).
                  </p>
                  <table className={styles.table} style={{marginTop: 8}}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Name</th>
                        <th className={styles.th}>Department</th>
                        <th className={styles.th}>End Date</th>
                        <th className={styles.th}>Scheduled Delete</th>
                        <th className={styles.th}>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming!.overdue!.map((it, idx) => (
                        <tr key={`od-${idx}`}>
                          <td className={styles.td}>
                            {[it.firstName, it.surname]
                              .filter(Boolean)
                              .join(' ') ||
                              it.email ||
                              (it.internId != null ? `ID ${it.internId}` : '-')}
                          </td>
                          <td className={styles.td}>{it.department ?? '-'}</td>
                          <td className={styles.td}>{fmt(it.endDate)}</td>
                          <td className={styles.td}>
                            {fmt(it.scheduledDelete)}
                          </td>
                          <td className={styles.td}>{it.email ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              className="bg-white rounded-xl shadow p-6"
              style={{marginTop: 16}}
            >
              <h3 className="text-base font-semibold text-[#2c3e50]">
                Deprovision Whitelist
              </h3>
              <p className="text-sm text-gray-600">
                Users here will not be deleted when their end date is reached.
              </p>

              <div className={styles.fieldRow}>
                <input
                  className={styles.select}
                  placeholder="Search by name, email, emp_id…"
                  value={depQuery}
                  onChange={e => void searchUsersDep(e.target.value)}
                />
                <div>
                  {depOpts.slice(0, 6).map(u => (
                    <button
                      key={u.id}
                      className={styles.btn}
                      style={{
                        border: '1px solid #ddd',
                        background: '#fff',
                        marginRight: 8,
                      }}
                      onClick={() => addToDeprovWhitelist(u.id)}
                    >
                      Add {u.firstName} {u.surname} ({u.role}) • {u.empId}
                    </button>
                  ))}
                </div>
              </div>

              <table className={styles.table} style={{marginTop: 12}}>
                <thead>
                  <tr>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {wlDep.length === 0 ? (
                    <tr>
                      <td className={styles.td} colSpan={4}>
                        No whitelist entries.
                      </td>
                    </tr>
                  ) : (
                    wlDep.map((w: any) => (
                      <tr key={w.user.id}>
                        <td className={styles.td}>
                          {w.user.firstName} {w.user.surname} • {w.user.empId}
                        </td>
                        <td className={styles.td}>{w.user.companyEmail}</td>
                        <td className={styles.td}>{w.user.role}</td>
                        <td className={styles.td}>
                          <button
                            className={styles.btn}
                            onClick={() => removeFromDeprovWhitelist(w.user.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        ) : section === 'docdel' ? (
          <>
            <div className={styles.contentHeader}>
              <h1 className={styles.contentTitle}>Document Deletion</h1>
              <p className={styles.contentDesc}>
                Delete documents after a configurable grace period from their
                end date.
              </p>
            </div>

            <section className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-[#2c3e50]">
                Deletion Settings
              </h2>

              <div className="mt-4 rounded-lg bg-[#f8f9fa] p-4">
                <div className={styles.fieldRow}>
                  <label>
                    <div className="text-sm text-gray-600 mb-1">
                      Delete after
                    </div>
                    <select
                      className={styles.select}
                      value={docDelayAmount}
                      onChange={e =>
                        onDocChangeAmount(parseInt(e.target.value || '0', 10))
                      }
                    >
                      {Array.from({length: 31}, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-sm text-gray-600 mb-1">Time unit</div>
                    <select
                      className={styles.select}
                      value={docDelayUnit}
                      onChange={e => onDocChangeUnit(e.target.value as any)}
                      disabled={docDelayAmount === 0}
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={docIncludeAvatar}
                      onChange={async e => {
                        const checked = e.target.checked;
                        setDocIncludeAvatar(checked); // optimistic
                        try {
                          await saveDocPolicy({
                            includeAvatar: checked,
                            includeProfileImage: checked, // backend compatibility
                          });
                        } catch {
                          setDocIncludeAvatar(!checked);
                        }
                      }}
                      disabled={docSaving}
                    />
                    <span className="text-sm text-gray-700">
                      Include profile image
                    </span>
                  </label>

                  <div style={{display: 'flex', alignItems: 'end', gap: 10}}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => runDocCleanupNow()}
                      disabled={docRunning}
                    >
                      {docRunning ? 'Running…' : 'Run Now (ignore delay)'}
                    </button>
                  </div>
                </div>

                <div className={styles.info}>
                  {docDelayAmount === 0
                    ? 'Documents will be deleted immediately after the end date.'
                    : `Documents will be deleted ${docDelayAmount} ${docDelayUnit.replace(/s$/, '')}${docDelayAmount === 1 ? '' : 's'} after the end date.`}
                </div>
              </div>

              <section className="bg-white rounded-xl shadow p-6 mt-6">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <h2 className="text-lg font-semibold text-[#2c3e50]">
                      Upcoming deletions (next 30 days)
                    </h2>
                    <p className="text-sm text-gray-600">
                      Based on End Date + delay (
                      {docUpcoming?.policy.delayAmount ?? docDelayAmount}{' '}
                      {docUpcoming?.policy.delayUnit ?? docDelayUnit})
                    </p>
                  </div>

                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => loadDocUpcoming(30)}
                    disabled={loadingDocUpcoming}
                  >
                    {loadingDocUpcoming ? 'Loading…' : 'Refresh'}
                  </button>
                </div>

                <div className="mt-4">
                  {!docUpcoming || docUpcoming.items.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No upcoming document deletions.
                    </div>
                  ) : (
                    <div style={{overflowX: 'auto'}}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.th}>Intern</th>
                            <th className={styles.th}>Email</th>
                            <th className={styles.th}>End date</th>
                            <th className={styles.th}>Delete on</th>
                            <th className={styles.th}>Docs</th>
                            <th className={styles.th}>Profile pic</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docUpcoming.items.map(it => (
                            <tr key={it.internId}>
                              <td className={styles.td}>{it.name}</td>
                              <td className={styles.td}>{it.email ?? '—'}</td>
                              <td className={styles.td}>
                                {new Date(it.endDate).toLocaleDateString()}
                              </td>
                              <td className={styles.td}>
                                {new Date(it.deleteAt).toLocaleDateString()}
                              </td>
                              <td className={styles.td}>{it.docsCount}</td>
                              <td className={styles.td}>
                                {it.hasProfilePicture
                                  ? it.includeAvatarByPolicy
                                    ? 'Will delete'
                                    : 'Exists (policy OFF)'
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            </section>
          </>
        ) : (
          /* ===== Document Reminders right pane ===== */
          <>
            <div className={styles.contentHeader}>
              <h1 className={styles.contentTitle}>Document Reminders</h1>
              <p className={styles.contentDesc}>
                Configure missing-document notifications and send them
                immediately.
              </p>
            </div>

            <section className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold text-[#2c3e50]">
                Reminder Settings
              </h2>

              <div className={styles.statusBar}>
                <div className={styles.statusGrid}>
                  <div className={styles.statusItem}>
                    <span
                      className={`${styles.statusIcon} ${styles.iconEmerald}`}
                    >
                      <i>✓</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Status</div>
                      <span
                        className={`${styles.badge} ${rem?.enabled ? styles.badgeActive : styles.badgeInactive}`}
                      >
                        {rem?.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span className={`${styles.statusIcon} ${styles.iconSky}`}>
                      <i>⏰</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Frequency</div>
                      <div className={styles.statusValue}>
                        {rem?.everyDays ?? 7} day(s)
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span className={`${styles.statusIcon} ${styles.iconGray}`}>
                      <i>📬</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Email</div>
                      <div className={styles.statusValue}>
                        {rem?.emailEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                  <div className={styles.statusItem}>
                    <span
                      className={`${styles.statusIcon} ${styles.iconAmber}`}
                    >
                      <i>🕒</i>
                    </span>
                    <div>
                      <div className={styles.statusLabel}>Last run</div>
                      <div className={styles.statusValue}>
                        {fmtDT(rem?.lastRunAt)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[#f8f9fa] p-4">
                <div className={styles.fieldRow}>
                  <label>
                    <div className="text-sm text-gray-600 mb-1">Enabled</div>
                    <select
                      className={styles.select}
                      value={rem?.enabled ? '1' : '0'}
                      onChange={e => saveRem({enabled: e.target.value === '1'})}
                      disabled={remSaving}
                    >
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-sm text-gray-600 mb-1">Every</div>
                    <select
                      className={styles.select}
                      value={rem?.everyDays ?? 7}
                      onChange={e =>
                        saveRem({everyDays: parseInt(e.target.value, 10) || 7})
                      }
                      disabled={remSaving}
                    >
                      {[3, 5, 7, 10, 14, 21, 28].map(n => (
                        <option key={n} value={n}>
                          {n} day(s)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-sm text-gray-600 mb-1">
                      Email notifications
                    </div>
                    <select
                      className={styles.select}
                      value={rem?.emailEnabled ? '1' : '0'}
                      onChange={e =>
                        saveRem({emailEnabled: e.target.value === '1'})
                      }
                      disabled={remSaving}
                    >
                      <option value="1">Enabled</option>
                      <option value="0">Disabled</option>
                    </select>
                  </label>
                </div>

                <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => runRemNow()}
                    disabled={remRunning}
                  >
                    {remRunning ? 'Sending…' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      void Promise.all([loadRem(), loadRemHistory()]);
                      showToast('Reloaded');
                    }}
                    style={{border: '1px solid #ddd', background: '#fff'}}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </section>

            {/* History Retention */}
            <section
              className="bg-white rounded-xl shadow p-6"
              style={{marginTop: 16}}
            >
              <h3 className="text-base font-semibold text-[#2c3e50]">
                History Retention
              </h3>
              <p className="text-sm text-gray-600">
                Remove old reminder items (Inbox &amp; Send History) older than
                the selected period.
              </p>

              <div className={styles.fieldRow}>
                <label>
                  <div className="text-sm text-gray-600 mb-1">Keep for</div>
                  <select
                    className={styles.select}
                    value={retentionMonths}
                    onChange={e =>
                      setRetentionMonths(parseInt(e.target.value, 10))
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map(m => (
                      <option key={m} value={m}>
                        {m} month{m === 1 ? '' : 's'} ({m * 30} days)
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{display: 'flex', gap: 10, alignItems: 'end'}}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => purgeReminders('both')} // deletes both buckets by retention
                  >
                    Delete older now
                  </button>

                  <button
                    type="button"
                    className={styles.btn}
                    style={{border: '1px solid #ddd', background: '#fff'}}
                    onClick={deleteAllReminders} // new helper below
                    title="Delete all reminder logs"
                  >
                    Delete all
                  </button>

                  <button
                    type="button"
                    className={styles.btn}
                    style={{border: '1px solid #ddd', background: '#fff'}}
                    onClick={saveAutoPurgeSettings}
                    title="Save auto-delete settings"
                  >
                    Save Auto-delete
                  </button>
                </div>

                <label style={{display: 'flex', alignItems: 'center', gap: 10}}>
                  <input
                    type="checkbox"
                    checked={autoPurgeEnabled}
                    onChange={e => setAutoPurgeEnabled(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">
                    Auto delete (server)
                  </span>
                </label>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                “Delete older now” runs a manual cleanup. If Auto delete is
                enabled, the server will purge items older than the selected
                retention automatically.
              </div>
            </section>

            <section
              className="bg-white rounded-xl shadow p-6"
              style={{marginTop: 16}}
            >
              <h3 className="text-base font-semibold text-[#2c3e50]">
                Whitelist
              </h3>
              <p className="text-sm text-gray-600">
                Users here will not receive document reminders.
              </p>

              <div className={styles.fieldRow}>
                <input
                  className={styles.select}
                  placeholder="Search by name, email, emp_id…"
                  value={uQuery}
                  onChange={e => void searchUsers(e.target.value)}
                />
                <div>
                  {uOpts.slice(0, 6).map(u => (
                    <button
                      key={u.id}
                      className={styles.btn}
                      style={{
                        border: '1px solid #ddd',
                        background: '#fff',
                        marginRight: 8,
                      }}
                      onClick={() => addToWhitelist(u.id)}
                    >
                      Add {u.firstName} {u.surname} ({u.role}) • {u.empId}
                    </button>
                  ))}
                </div>
              </div>

              <table className={styles.table} style={{marginTop: 12}}>
                <thead>
                  <tr>
                    <th className={styles.th}>User</th>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {wl.length === 0 ? (
                    <tr>
                      <td className={styles.td} colSpan={4}>
                        No whitelist entries.
                      </td>
                    </tr>
                  ) : (
                    wl.map((w: any) => (
                      <tr key={w.user.id}>
                        <td className={styles.td}>
                          {w.user.firstName} {w.user.surname} • {w.user.empId}
                        </td>
                        <td className={styles.td}>{w.user.companyEmail}</td>
                        <td className={styles.td}>{w.user.role}</td>
                        <td className={styles.td}>
                          <button
                            className={styles.btn}
                            onClick={() => removeFromWhitelist(w.user.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className={`${styles.card} ${styles.tableCard}`}>
              <h2 className="text-lg font-semibold text-[#2c3e50]">
                Send History
              </h2>
              <p className="text-sm text-gray-600">
                Recent reminder runs. (This will populate as your backend starts
                storing history.)
              </p>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Sent At</th>
                    <th className={styles.th}>Recipients</th>
                    <th className={styles.th}>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td className={styles.td} colSpan={3}>
                        No history yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((h, i) => (
                      <tr key={h.id ?? i}>
                        <td className={styles.td}>{fmtDT(h.sentAt)}</td>
                        <td className={styles.td}>{h.totalRecipients}</td>
                        <td className={styles.td}>
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
            </section>
          </>
        )}
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
