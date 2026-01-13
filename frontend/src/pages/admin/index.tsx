// frontend/src/pages/admin/index.tsx
import Link from 'next/link';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { fetchWithAuth } from '@/lib/api';

import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import { Deadline } from '@/types/dashboard';


type Role = 'intern' | 'hr' | 'super_admin';

type MeSummary = {
  status: 'active' | 'inactive' | null;
  startDate: string | null;
  endDate: string | null;
  department: string | null;
  position: string | null;
  daysLeft: number | null;
};

type PeopleStats = { interns: number; employees: number; teamLeads: number };

function AdminHome() {
  const { user, loading } = useAuth();
  const role = (user?.role ?? 'intern') as Role;
  const [missingDocs, setMissingDocs] = useState<{ count: number; total: number; percent: number } | null>(null);

  // Which tabs are allowed for this user?
  const tabs = useMemo<string[]>(() => {
    if (role === 'super_admin') return ['intern', 'super_admin'];
    if (role === 'hr') return ['intern', 'hr'];
    return [];
  }, [role]);

  const [activeTab, setActiveTab] = useState<string>('');
  useEffect(() => {
    if (tabs.length && !activeTab) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // Data
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [people, setPeople] = useState<PeopleStats | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await fetchWithAuth('/api/stats/deadlines', { cache: 'no-store' as RequestCache });
        const j = await r.json();
        setDeadlines(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setDeadlines([]);
      }
    })();
  }, [user]);

  // Fetch intern summary for the *logged-in* user (HR/Super Admin can also be interns)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/stats/me');
        const d = await res.json();
        const s: MeSummary = {
          status: d?.status ? String(d.status).toLowerCase() as MeSummary['status'] : null,
          startDate: d?.startDate ? new Date(d.startDate).toISOString() : null,
          endDate: d?.endDate ? new Date(d.endDate).toISOString() : null,
          department: d?.department ?? null,
          position: d?.position ?? null,
          daysLeft: typeof d?.daysRemaining === 'number' ? d.daysRemaining : null,
        };
        setSummary(s);
      } catch {
        setSummary(null);
      }
    })();
  }, [user]);

  // Fetch HR stats if the user can see HR or Super Admin dashboards
  useEffect(() => {
    if (!user) return;
    if (role !== 'hr' && role !== 'super_admin') return;

    (async () => {
  try {
    const res = await fetchWithAuth('/api/stats/admin/summary', { cache: 'no-store' as RequestCache });
    const d = await res.json();

    setPeople({
      interns: Number(d?.activeInterns ?? 0),
      employees: Number(d?.activeEmployees ?? 0),
      teamLeads: Number(d?.activeTeamLeads ?? 0),
    });

    setMissingDocs({
      count: Number(d?.missingDocs?.count ?? 0),
      total: Number(d?.missingDocs?.total ?? 0),
      percent: Number(d?.missingDocs?.percent ?? 0),
    });
  } catch {
    setPeople({ interns: 0, employees: 0, teamLeads: 0 });
    setMissingDocs({ count: 0, total: 0, percent: 0 });
  }
})();

  }, [user, role]);

  

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

  if (!user) return <main style={{ padding: 24 }}><Link href="/login">Login</Link> required.</main>;
  if (role !== 'hr' && role !== 'super_admin') {
    return <main style={{ padding: 24 }}>Forbidden.</main>;
  }

  const displayName = user.firstName ? `${user.firstName} ${user.surname ?? ''}`.trim() : (user.email ?? 'User');
  const displayedDeadlines = showAllDeadlines ? deadlines : deadlines.slice(0, 3);

  const getStatusVariant = (status: string) => {
    return status === 'active' ? 'success' : 'warning';
  };

  const getUrgency = (days: number) => {
    if (days <= 2) return 'critical';
    if (days <= 7) return 'high';
    if (days <= 14) return 'medium';
    return 'low';
  };

  const hasEndDate = !!summary?.endDate;

  // Percent shares shown in the Super Admin "People Statistics" block
const peopleTotal = (people?.interns ?? 0) + (people?.employees ?? 0) + (people?.teamLeads ?? 0);
const sharePct = (n: number) => (peopleTotal ? Math.round((n * 100) / peopleTotal) : 0);


  return (
    <div className="modern-dashboard admin-dashboard">
      <Head>
        <title>Admin Dashboard • Intern Portal</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
      </Head>

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-main">
          <div className="header-left">
            <h1 className="dashboard-title">Admin Dashboard</h1>
            <div className="welcome-text">Welcome back, {displayName}! 👋</div>
          </div>
          
        </div>
      </header>

      {/* Role Tabs */}
      <div className="role-tabs-container">
        <div className="role-tabs">
          {/* Intern Tab - Show for both HR and Super Admin */}
          {tabs.includes('intern') && (
            <button
              className={`role-tab ${activeTab === 'intern' ? 'active' : ''}`}
              onClick={() => setActiveTab('intern')}
            >
              <i className="fas fa-user-graduate"></i>
              Dashboard
            </button>
          )}
          
          {/* HR Tab - Only show for HR role */}
          {tabs.includes('hr') && (
            <button
              className={`role-tab ${activeTab === 'hr' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr')}
            >
              <i className="fas fa-users"></i>
              HR Dashboard
            </button>
          )}
          
          {/* Super Admin Tab - Only show for Super Admin role */}
          {tabs.includes('super_admin') && (
            <button
              className={`role-tab ${activeTab === 'super_admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('super_admin')}
            >
              <i className="fas fa-shield-alt"></i>
              Super Admin
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Intern Dashboard Tab - Show for both HR and Super Admin */}
        {activeTab === 'intern' && (
          <div className="tab-content active">
            {/* Key Metrics Grid */}
            <section className="metrics-grid">
              <div className="metric-card status">
                <div className="metric-icon">
                  <i className="fas fa-rocket"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Status</div>
                  <div className={`metric-value ${getStatusVariant(summary?.status || '')}`}>
                    {(summary?.status || '—').toString().replace('_', ' ')}
                  </div>
                  <div className="metric-description">
                    Since {summary?.startDate ? new Date(summary.startDate).toLocaleDateString() : '—'}
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
      <div className="metric-value">{summary?.daysLeft ?? '—'} days</div>
      <div className="metric-description">
        Ends {new Date(summary!.endDate as string).toLocaleDateString()}
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
                  <div className="metric-value">{summary?.position || '—'}</div>
                  <div className="metric-description">{summary?.department || '—'}</div>
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
          </div>
        )}

        {/* HR Dashboard Tab - Only for HR role */}
        {activeTab === 'hr' && (
          <div className="tab-content active">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-users"></i>
                HR Overview
              </h2>
            </div>

            <section className="metrics-grid">
              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#dbeafe', color: '#3b82f6' }}>
                  <i className="fas fa-user-graduate"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Active Interns</div>
                  <div className="metric-value">{people?.interns ?? 0}</div>
                  <div className="metric-description">Currently active</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <i className="fas fa-briefcase"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Active Employees</div>
                  <div className="metric-value">{people?.employees ?? 0}</div>
                  <div className="metric-description">Full-time staff</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                  <i className="fas fa-user-tie"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Team Leads</div>
                  <div className="metric-value">{people?.teamLeads ?? 0}</div>
                  <div className="metric-description">Managing teams</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#fee2e2', color: '#ef4444' }}>
                  <i className="fas fa-exclamation-circle"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Document Alerts</div>
                  <div className="metric-value">{missingDocs?.count ?? 0}</div>
                  <div className="metric-description">
  {missingDocs
    ? `${missingDocs.count} of ${missingDocs.total} intern users missing required docs (${missingDocs.percent}%)`
    : 'Missing documents'}
</div>
                </div>
              </div>
            </section>

            {/* Quick Actions for HR */}
            <section className="quick-actions">
              <div className="section-header">
                <div className="section-title">
                  <i className="fas fa-bolt"></i>
                  Quick Actions
                </div>
              </div>
              <div className="actions-grid">
                <Link href="/admin/interns" className="action-card">
                  <div className="action-icon" style={{ background: '#3b82f6' }}>
                    <i className="fas fa-user-graduate"></i>
                  </div>
                  <span>Manage Interns</span>
                </Link>
                        <Link href="/admin/documents" className="action-card">
                  <div className="action-icon" style={{ background: '#ef4444' }}>
                    <i className="fas fa-file-contract"></i>
                  </div>
                  <span>Document Review</span>
                </Link>
                <Link href="/admin/analytics" className="action-card">
                  <div className="action-icon" style={{ background: '#10b981' }}>
                    <i className="fas fa-chart-bar"></i>
                  </div>
                  <span>Analytics</span>
                </Link>
              </div>
            </section>
          </div>
        )}

        {/* Super Admin Dashboard Tab - Only for Super Admin role */}
        {activeTab === 'super_admin' && (
          <div className="tab-content active">
            <div className="section-header">
              <h2 className="section-title">
                <i className="fas fa-shield-alt"></i>
                System Overview
              </h2>
            </div>

            {/* System Health Metrics */}
            <section className="metrics-grid">
              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#dbeafe', color: '#3b82f6' }}>
                  <i className="fas fa-user-check"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Live Users</div>
                  <div className="metric-value">—</div>
                  <div className="metric-description">Active sessions</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <i className="fas fa-heartbeat"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">System Health</div>
                  <div className="metric-value">OK</div>
                  <div className="metric-description">All systems operational</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                  <i className="fas fa-database"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">Storage Usage</div>
                  <div className="metric-value">—</div>
                  <div className="metric-description">Database capacity</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                  <i className="fas fa-code"></i>
                </div>
                <div className="metric-content">
                  <div className="metric-label">API Requests</div>
                  <div className="metric-value">—</div>
                  <div className="metric-description">Last 24 hours</div>
                </div>
              </div>
            </section>

            {/* People Statistics */}
            <section className="people-stats">
              <div className="section-header">
                <h3 className="section-subtitle">People Statistics</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{people?.interns ?? 0}</div>
                  <div className="stat-label">Active Interns</div>
                  <div className="stat-trend positive">{sharePct(people?.interns ?? 0)}%</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{people?.employees ?? 0}</div>
                  <div className="stat-label">Active Employees</div>
                  <div className="stat-trend neutral">{sharePct(people?.employees ?? 0)}%</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{people?.teamLeads ?? 0}</div>
                  <div className="stat-label">Active  Team Leads</div>
                  <div className="stat-trend positive">{sharePct(people?.teamLeads ?? 0)}%</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{missingDocs?.count ?? 0}</div>
                  <div className="stat-label">Document Alerts</div>
                  <div className="stat-trend negative">{missingDocs?.percent ?? 0}%</div>
                </div>
              </div>
            </section>

            {/* Admin Actions */}
            <section className="quick-actions">
              <div className="section-header">
                <div className="section-title">
                  <i className="fas fa-cog"></i>
                  System Management
                </div>
              </div>
              <div className="actions-grid">
                <Link href="/admin/users" className="action-card">
                  <div className="action-icon" style={{ background: '#3b82f6' }}>
                    <i className="fas fa-users-cog"></i>
                  </div>
                  <span>User Management</span>
                </Link>
                <Link href="/admin/system" className="action-card">
                  <div className="action-icon" style={{ background: '#8b5cf6' }}>
                    <i className="fas fa-sliders-h"></i>
                  </div>
                  <span>System Settings</span>
                </Link>
                <Link href="/admin/security" className="action-card">
                  <div className="action-icon" style={{ background: '#ef4444' }}>
                    <i className="fas fa-clipboard-list"></i>
                  </div>
                  <span>Audit Logs</span>
                </Link>
                <Link href="/admin/backup" className="action-card">
                  <div className="action-icon" style={{ background: '#10b981' }}>
                    <i className="fas fa-database"></i>
                  </div>
                  <span>Backup & Restore</span>
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>

      
    </div>
  );
}

export default function Wrapped() {
  return (
    <ProtectedRoute>
      <AdminHome />
    </ProtectedRoute>
  );
}