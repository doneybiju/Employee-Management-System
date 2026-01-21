// frontend/src/components/Navigation.tsx
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/lib/api';

export default function Navigation() {
  const { isAuthenticated, logout, user, mustChangePassword } = useAuth();
  if (mustChangePassword) return null;
  const router = useRouter();

  const [prof, setProf] = useState<{ name: string; avatar: string }>({ name: '', avatar: '' });

  const isHR = user?.role === 'hr';
  const isSA = user?.role === 'super_admin';
  const isLead = user?.empType === 'team_lead';
  const isStaff = isHR || isSA;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const [openIM, setOpenIM] = useState(true);
  const [openSettings, setOpenSettings] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [router.pathname]);

  useEffect(() => {
    const cls = 'nav-collapsed';
    if (!isMobile) {
      if (collapsed) document.body.classList.add(cls);
      else document.body.classList.remove(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => document.body.classList.remove(cls);
  }, [collapsed, isMobile]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (isMobile || collapsed) return;
      const target = e.target as Node;
      const inside = sidebarRef.current?.contains(target);
      const onToggle = (target as HTMLElement).closest?.('.menu-toggle');
      if (!inside && !onToggle) setCollapsed(true);
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [collapsed, isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active =
      router.pathname === href || router.pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className={`nav-item${active ? ' active' : ''}`}
        onClick={() => {
          setMobileOpen(false);
          setCollapsed(true);
        }}
      >
        {label}
      </Link>
    );
  };

  const showToggle = isMobile ? !mobileOpen : collapsed;

  return (
    <>
      <button
        className={`menu-toggle${showToggle ? '' : ' hidden'}`}
        onClick={() => {
          if (isMobile) setMobileOpen(true);
          else setCollapsed(false);
        }}
        aria-label="Open menu"
        aria-expanded={isMobile ? mobileOpen : !collapsed}
      >
        ☰
      </button>

      <aside
        ref={sidebarRef}
        className={`sidebar${mobileOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}
        aria-hidden={isMobile ? !mobileOpen : collapsed}
      >
        <div className="logo">
          <Link href="/profile" className="user-chip" title="Open profile">
            <img className="avatar" src={prof.avatar} alt="avatar" />
            <span className="name">{prof.name || user?.email || 'Profile'}</span>
          </Link>
        </div>

        <div className="nav-section">
          <div className="nav-title">Main</div>
          <NavLink href="/" label="Dashboard" />
          {isAuthenticated && <NavLink href="/my-work" label="My Work" />} 
          {isAuthenticated && <NavLink href="/requests" label="Requests" />}
          {(isSA || isLead || isHR) && <NavLink href="/projects" label="Projects" />}
        </div>

        {isStaff && (
          <div className="nav-section">
            <div className="nav-title">Intern Management</div>

            <div className="nav-item has-children" onClick={() => setOpenIM(s => !s)}>
              <span>Manage</span>
              <span className="chevron">{openIM ? '▾' : '▸'}</span>
            </div>
            <div className={`nav-children${openIM ? ' open' : ''}`}>
              <NavLink href="/admin/users" label="Manage Users" />
              <NavLink href="/admin/document-management" label="Document Management" />
              <NavLink href="/create-user-auto" label="Create User (auto)" />
              <NavLink href="/departments" label="Departments" />
            </div>

            <NavLink href="/requests-review" label="Requests Review" />
          </div>
        )}

        {isSA && (
          <div className="nav-section">
            <div className="nav-title">Settings</div>

            <div className="nav-item has-children" onClick={() => setOpenSettings(s => !s)}>
              <span>System</span>
              <span className="chevron">{openSettings ? '▾' : '▸'}</span>
            </div>
            <div className={`nav-children${openSettings ? ' open' : ''}`}>
              <NavLink href="/admin/deprovision" label="Cron / Deprovision" />
              <NavLink href="/admin/smtp" label="SMTP Settings" />
              <NavLink href="/admin/email-templates" label="Email Templates" />
              <NavLink href="/admin/logs" label="Logs" />  
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', padding: '12px 25px' }}>
          {isAuthenticated ? (
            <button onClick={logout} className="nav-item" style={{ width: '100%', textAlign: 'left' }}>
              Logout
            </button>
          ) : (
            <NavLink href="/login" label="Login" />
          )}
        </div>
      </aside>

      {(mobileOpen || !collapsed) && (
        <div
          className="backdrop"
          onClick={() => { setMobileOpen(false); setCollapsed(true); }}
        />
      )}
    </>
  );
}
