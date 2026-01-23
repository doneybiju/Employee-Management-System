// frontend/src/pages/index.tsx
import Head from 'next/head';
import {useEffect, useState} from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';

import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import {Deadline} from '@/types/dashboard';
import Link from 'next/link';

type MeStats = {
  status: 'Active' | 'Inactive' | null;
  startDate: string | null;
  endDate: string | null;
  department: string | null;
  position: string | null;
  daysRemaining: number | null;
};

function useMissingDocsNotice() {
  const [missing, setMissing] = useState<string[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/reminders/me', {
          cache: 'no-store' as RequestCache,
        });
        const j = await res.json().catch(() => ({missing: []}));
        const list = Array.isArray(j?.missing) ? j.missing : [];
        setMissing(list);
        const until = Number(localStorage.getItem('doc_notice_until') || 0);
        setShow(list.length > 0 && Date.now() > until);
      } catch {
        setShow(false);
      }
    })();
  }, []);

  function remindLater() {
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem('doc_notice_until', String(Date.now() + day));
    setShow(false);
  }

  function dismiss() {
    setShow(false);
  }

  return {missing, show, remindLater, dismiss};
}

function ModernNotification({
  missing,
  onLater,
  onDismiss,
}: {
  missing: string[];
  onLater: () => void;
  onDismiss: () => void;
}) {
  if (missing.length === 0) return null;

  return (
    <div className="modern-notification">
      <div className="notification-badge">
        <i className="fas fa-exclamation-circle" />
      </div>
      <div className="notification-body">
        <div className="notification-title">Required Documents</div>
        <div className="notification-desc">
          Upload {missing.join(', ')} to complete your profile
        </div>
      </div>
      <div className="notification-actions">
        <button
          className="action-btn primary"
          onClick={() => (window.location.href = '/profile')}
        >
          Upload Now
        </button>
        <button className="action-btn secondary" onClick={onLater}>
          Later
        </button>
        <button className="close-btn" onClick={onDismiss}>
          <i className="fas fa-times" />
        </button>
      </div>
    </div>
  );
}

function IndexInner() {
  const notice = useMissingDocsNotice();
  const {user, loading} = useAuth();
  const [me, setMe] = useState<MeStats | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithAuth('/api/stats/deadlines', {
          cache: 'no-store' as RequestCache,
        });
        const j = await r.json();
        setDeadlines(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setDeadlines([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/stats/me');
        const j = await res.json();
        setMe(j ?? null);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  const displayedDeadlines = showAllDeadlines
    ? deadlines
    : deadlines.slice(0, 3);

  const getStatusVariant = (status: string) => {
    return status === 'Active' ? 'success' : 'warning';
  };

  const getUrgency = (days: number) => {
    if (days <= 2) return 'critical';
    if (days <= 7) return 'high';
    if (days <= 14) return 'medium';
    return 'low';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
        <p>Preparing your dashboard...</p>
      </div>
    );
  }

  const hasEndDate = !!me?.endDate;

  return (
    <div className="modern-dashboard">
      <Head>
        <title>Dashboard • Intern Portal</title>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-main">
          <div className="header-left">
            <h1 className="dashboard-title">Dashboard</h1>
            <div className="welcome-text">
              Welcome back, {user?.firstName || 'Intern'}! 👋
            </div>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      {notice.show && (
        <ModernNotification
          missing={notice.missing}
          onLater={notice.remindLater}
          onDismiss={notice.dismiss}
        />
      )}

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Key Metrics Grid */}
        <section className="metrics-grid">
          <div className="metric-card status">
            <div className="metric-icon">
              <i className="fas fa-rocket"></i>
            </div>
            <div className="metric-content">
              <div className="metric-label">Status</div>
              <div
                className={`metric-value ${getStatusVariant(me?.status || '')}`}
              >
                {me?.status || '—'}
              </div>
              <div className="metric-description">
                Since{' '}
                {me?.startDate
                  ? new Date(me.startDate).toLocaleDateString()
                  : '—'}
              </div>
            </div>
          </div>

          {hasEndDate && (
            <div className="metric-card timeline">
              <div className="metric-icon">
                <i className="fas fa-calendar"></i>
              </div>
              <div className="metric-content">
                <div className="metric-label">Timeline</div>
                <div className="metric-value">
                  {me?.daysRemaining ?? '—'} days
                </div>
                <div className="metric-description">
                  Ends {new Date(me!.endDate as string).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}

          <div className="metric-card position">
            <div className="metric-icon">
              <i className="fas fa-briefcase"></i>
            </div>
            <div className="metric-content">
              <div className="metric-label">Position</div>
              <div className="metric-value">{me?.position || '—'}</div>
              <div className="metric-description">{me?.department || '—'}</div>
            </div>
          </div>
        </section>

        {/* Deadlines Section */}
        <UpcomingDeadlines deadlines={deadlines} />

        {/* Quick Actions */}
        <section className="quick-actions">
          <div className="section-header">
            <div className="section-title">
              <i className="fas fa-bolt"></i>
              Quick Actions
            </div>
          </div>
          <div className="actions-grid">
            <button className="action-card">
              <div className="action-icon">
                <i className="fas fa-upload"></i>
              </div>
              <span>Upload Docs</span>
            </button>
            <Link href="/my-work" className="action-card">
              <div className="action-icon">
                <i className="fas fa-tasks"></i>
              </div>
              <span>My Tasks</span>
            </Link>

            <button className="action-card">
              <div className="action-icon">
                <i className="fas fa-file-alt"></i>
              </div>
              <span>Reports</span>
            </button>
            <button className="action-card">
              <div className="action-icon">
                <i className="fas fa-calendar-check"></i>
              </div>
              <span>Schedule</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <IndexInner />
    </ProtectedRoute>
  );
}
