import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/lib/api';
import {
  LayoutDashboard,
  CheckSquare,
  Briefcase,
  Clock,
  User,
  Users,
  FileText,
  UserPlus,
  Building,
  ClipboardCheck,
  Timer,
  Mail,
  FileCode,
  Scroll,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export default function Navigation() {
  const { isAuthenticated, logout, user, mustChangePassword } = useAuth();
  const router = useRouter();

  // State for profile data
  const [prof, setProf] = useState<{ name: string; avatar: string }>({
    name: '',
    avatar: '',
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  // Accordion states
  const [openIM, setOpenIM] = useState(true);
  const [openSettings, setOpenSettings] = useState(true);

  // Derived roles
  const isHR = user?.role === 'hr';
  const isSA = user?.role === 'super_admin';
  const isLead = user?.empType === 'team_lead';
  const isStaff = isHR || isSA;

  // Fetch profile effect
  useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;

    const loadProfile = async () => {
      try {
        const res = await fetchWithAuth('/api/profile');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;

        let avatarUrl = data.avatarUrl || '/account.png';

        // Handle Google Drive proxy for authenticated images
        if (avatarUrl.startsWith('/api/uploads/drive/file/')) {
             const token = localStorage.getItem('token') || '';
             try {
                const resp = await fetch(avatarUrl, { headers: { Authorization: `Bearer ${token}` } });
                if (resp.ok) {
                    const blob = await resp.blob();
                    avatarUrl = URL.createObjectURL(blob);
                } else {
                    avatarUrl = '/account.png';
                }
             } catch {
                avatarUrl = '/account.png';
             }
        }

        setProf({
            name: `${data.firstName || ''} ${data.surname || ''}`.trim(),
            avatar: avatarUrl
        });
      } catch (e) {
        console.error('Failed to load nav profile', e);
      }
    };

    loadProfile();

    return () => {
        mounted = false;
    };
  }, [isAuthenticated]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [router.pathname]);

  if (mustChangePassword) return null;

  // Nav Item Component
  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const active = router.pathname === href || (href !== '/' && router.pathname.startsWith(href));

    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1
          ${active
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
          }`}
      >
        <Icon size={18} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Header & Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#111] border-b border-gray-200 dark:border-gray-800 z-40 flex items-center justify-between px-4">
        <div className="font-bold text-xl text-blue-600 dark:text-blue-400">Extramus</div>
        <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            aria-label="Open menu"
        >
            <Menu size={24} />
        </button>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#111] border-r border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-300 ease-in-out
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
            <Link href="/" className="font-bold text-2xl text-blue-600 dark:text-blue-400 tracking-tight">
                Extramus
            </Link>
            <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close menu"
            >
                <X size={20} />
            </button>
        </div>

        {/* Scroll Area */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">

            {/* Main Section */}
            <div>
                <div className="px-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    Platform
                </div>
                <NavItem href="/" label="Dashboard" icon={LayoutDashboard} />
                {isAuthenticated && <NavItem href="/my-work" label="My Work" icon={CheckSquare} />}
                {isAuthenticated && <NavItem href="/requests" label="Requests" icon={Clock} />}
                {(isSA || isLead || isHR) && <NavItem href="/projects" label="Projects" icon={Briefcase} />}
                <NavItem href="/profile" label="Profile" icon={User} />
            </div>

            {/* Intern Management (Admin/HR) */}
            {isStaff && (
                <div>
                    <button
                        onClick={() => setOpenIM(!openIM)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <span>Intern Management</span>
                        {openIM ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {openIM && (
                        <div className="mt-1 space-y-1">
                            <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <Users size={16} />
                                <span>Manage Users</span>
                            </Link>
                             <Link href="/admin/document-management" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <FileText size={16} />
                                <span>Documents</span>
                            </Link>
                             <Link href="/create-user-auto" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <UserPlus size={16} />
                                <span>Create User</span>
                            </Link>
                             <Link href="/departments" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <Building size={16} />
                                <span>Departments</span>
                            </Link>
                             <Link href="/requests-review" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <ClipboardCheck size={16} />
                                <span>Req. Review</span>
                            </Link>
                        </div>
                    )}
                </div>
            )}

            {/* System Settings (Super Admin) */}
            {isSA && (
                <div>
                     <button
                        onClick={() => setOpenSettings(!openSettings)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <span>System Settings</span>
                        {openSettings ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {openSettings && (
                        <div className="mt-1 space-y-1">
                             <Link href="/admin/deprovision" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <Timer size={16} />
                                <span>Deprovision</span>
                            </Link>
                             <Link href="/admin/smtp" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <Mail size={16} />
                                <span>SMTP</span>
                            </Link>
                             <Link href="/admin/email-templates" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <FileCode size={16} />
                                <span>Templates</span>
                            </Link>
                             <Link href="/admin/logs" className="flex items-center gap-3 px-3 py-2 pl-9 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <Scroll size={16} />
                                <span>Logs</span>
                            </Link>
                        </div>
                    )}
                </div>
            )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#151515]">
            {isAuthenticated ? (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 px-2">
                        <img
                            src={prof.avatar || '/account.png'}
                            alt="Profile"
                            className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 object-cover"
                            onError={(e) => { e.currentTarget.src = '/account.png'; }}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {prof.name || user?.firstName || 'User'}
                            </div>
                            <div className="text-xs text-gray-500 truncate capitalize">
                                {user?.role?.replace('_', ' ')}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={logout}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                    >
                        <LogOut size={16} />
                        <span>Logout</span>
                    </button>
                </div>
            ) : (
                <NavItem href="/login" label="Login" icon={LogOut} />
            )}
        </div>
      </aside>
    </>
  );
}
