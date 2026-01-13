import Head from 'next/head';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';

function PageInner() {
  return (
    <div className="modern-dashboard admin-dashboard">
      <Head>
        <title>System Settings • Intern Portal</title>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      <header className="dashboard-header">
        <div className="header-main">
          <div className="header-left">
            <h1 className="dashboard-title">System Settings</h1>
            <div className="welcome-text">
              Central place to manage system-wide configuration.
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="quick-actions">
          <div className="section-header">
            <div className="section-title">
              <i className="fas fa-sliders-h"></i>
              Settings
            </div>
          </div>

          <div className="actions-grid">
            <Link href="/admin/deprovision" className="action-card">
              <div className="action-icon" style={{ background: '#ef4444' }}>
                <i className="fas fa-user-slash"></i>
              </div>
              <span>Deprovision</span>
            </Link>

            <Link href="/admin/smtp" className="action-card">
              <div className="action-icon" style={{ background: '#3b82f6' }}>
                <i className="fas fa-envelope"></i>
              </div>
              <span>SMTP</span>
            </Link>

            <Link href="/admin/email-templates" className="action-card">
              <div className="action-icon" style={{ background: '#8b5cf6' }}>
                <i className="fas fa-file-alt"></i>
              </div>
              <span>Email Templates</span>
            </Link>

            <Link href="/admin/security" className="action-card">
              <div className="action-icon" style={{ background: '#10b981' }}>
                <i className="fas fa-shield-alt"></i>
              </div>
              <span>Security</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function SystemSettingsPage() {
  return (
    <ProtectedRoute roles={['super_admin']}>
      <PageInner />
    </ProtectedRoute>
  );
}
