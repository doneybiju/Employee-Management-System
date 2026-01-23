import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import {blockUser, unblockUser} from '@/lib/api';
import {
  Search,
  MoreHorizontal,
  Phone,
  Mail,
  Calendar,
  User as UserIcon,
  Briefcase,
  X,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  ClipboardList,
  Upload,
} from 'lucide-react';

/* ================= Types ================= */
type EmpType = 'intern' | 'employee' | 'team_lead';

type Row = {
  userId: number | null;
  internId: string | null;
  role: 'intern' | 'hr' | 'super_admin';
  name: string;
  department: string | null;
  position: string | null;
  companyEmail: string | null;
  phone: string | null;
  employeeId: string | null;
  joiningDate: string | null;
  leavingDate: string | null;
  personalEmail: string;
  nationality: string | null;
  dob: string | null;
  gender: string | null;
  supervisor: string | null;
  status: 'active' | 'inactive' | string | null;
  blocked?: boolean;

  empType?: EmpType | null;
};

type Tab = 'active' | 'inactive';

const normalizeEmpType = (v?: string | null): EmpType =>
  v === 'owner' ? 'team_lead' : (v as EmpType) || 'intern';

const roleLabel = (role: Row['role']) => (role === 'intern' ? 'EMP' : role);

/* dd/mm/yyyy display */
const dmy = (v?: string | Date | null) => {
  if (!v) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = typeof v === 'string' ? new Date(v) : v;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
};

/* ================= UI Components ================= */

function Avatar({
  name,
  size = 'sm',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-20 h-20 text-xl',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold shadow-sm ring-1 ring-blue-200 dark:ring-blue-800`}
    >
      {initials}
    </div>
  );
}

function StatusBadge({
  status,
  blocked,
}: {
  status: string | null;
  blocked?: boolean;
}) {
  if (blocked) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
        Blocked
      </span>
    );
  }
  const s = (status || 'inactive').toLowerCase();
  if (s === 'active') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      Inactive
    </span>
  );
}

function RolePill({label}: {label: string}) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
      {label}
    </span>
  );
}

function SideDrawer({
  isOpen,
  onClose,
  children,
  title,
  actions,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const t = setTimeout(() => setVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!visible && !isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } flex flex-col h-full border-l border-gray-200 dark:border-gray-800`}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white/50 dark:bg-gray-900/50 backdrop-blur sticky top-0 z-10">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

/* ================= Main Page ================= */

export default function AdminUsers() {
  const {user, loading} = useAuth();
  const role = user?.role ?? 'intern';
  const isHR = role === 'hr';
  const isSA = role === 'super_admin';
  const isStaff = isHR || isSA;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  // Edit State
  const [editStart, setEditStart] = useState<string>('');
  const [editPersonalEmail, setEditPersonalEmail] = useState<string>('');
  const [editNationality, setEditNationality] = useState<string>('');
  const [editGender, setEditGender] = useState<string>('');
  const [editSupervisor, setEditSupervisor] = useState<string>('');
  const [editBirthdate, setEditBirthdate] = useState<string>('');
  const [editRole, setEditRole] = useState<'intern' | 'hr' | 'super_admin'>(
    'intern',
  );
  const [editEmpType, setEditEmpType] = useState<EmpType>('intern');
  const [editName, setEditName] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');

  // Department State
  type Dept = {
    id: number;
    departmentName: string;
    positions: {id: number; name: string}[];
  };
  const [depts, setDepts] = useState<Dept[]>([]);
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editPosId, setEditPosId] = useState<number | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [dep, setDep] = useState<string>('all');
  const [gen, setGen] = useState<string>('all');
  const [country, setCountry] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);

  // UI State
  const [edit, setEdit] = useState<Row | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [viewDetail, setViewDetail] = useState<any | null>(null);
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<any[]>([]);
  const [updateLogUser, setUpdateLogUser] = useState<Row | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null); // For "..." menu

  // Load Rows
  const loadRows = async (whichTab: Tab = tab) => {
    try {
      const res = await fetchWithAuth(`/api/admin/users?tab=${whichTab}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    }
  };

  useEffect(() => {
    if (!loading) loadRows(tab);
  }, [loading, tab]);

  // Load Departments
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/departments');
        const list = await res.json();
        const names = Array.isArray(list)
          ? list.map((d: any) => d.departmentName).filter(Boolean)
          : [];
        setDepartments(
          names.sort((a: string, b: string) => a.localeCompare(b)),
        );
      } catch {
        setDepartments([]);
      }
    })();
  }, []);

  async function loadDepartmentsFull(): Promise<Dept[]> {
    const res = await fetchWithAuth('/api/departments/full');
    const arr = (await res.json()) as Dept[] | unknown;
    const list = Array.isArray(arr) ? (arr as Dept[]) : [];
    setDepts(list);
    return list;
  }

  // Deletion Logic
  const tryGsuiteDelete = async (
    email?: string | null,
  ): Promise<{attempted: number; ok: boolean; error?: string}> => {
    if (!email) return {attempted: 0, ok: false, error: 'no email'};
    const paths = [
      '/api/gsuite/delete',
      '/api/gsuite/users/delete',
      '/api/gsuite/deprovision/delete',
    ];
    for (const p of paths) {
      try {
        const res = await fetchWithAuth(p, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email}),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && (j?.ok || j?.deleted || j?.success)) {
          return {attempted: 1, ok: true};
        }
      } catch {}
    }
    return {attempted: 1, ok: false};
  };

  const deactivateActiveUser = async (r: Row) => {
    const res = await fetchWithAuth('/api/admin/users/deactivate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        userId: r.userId,
        internId: r.internId,
        companyEmail: r.companyEmail,
      }),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (j?.error === 'end_date_required') {
        alert('End date is required before deleting. Please set the end date.');
        openEdit(r, {forDelete: true});
        return;
      }
      throw new Error(j?.error || `HTTP ${res.status}`);
    }

    let workspaceLine = 'Workspace: skipped';
    if (r.companyEmail) {
      const g = await tryGsuiteDelete(r.companyEmail);
      workspaceLine = `Workspace: ${g.ok ? 'deleted' : 'failed'}`;
    }

    const msg = [
      `Portal deleted: ${j?.portal?.deletedUsers ?? 0}`,
      `Internships inactivated: ${j?.portal?.inactivated ?? j?.portal?.inactivatedInternships ?? 0}`,
      workspaceLine,
    ].join(' • ');

    alert(msg);
    await loadRows('active');
  };

  const handleDelete = async (r: Row) => {
    if (tab === 'active') {
      if (r.internId && !r.leavingDate) {
        alert('End date is required before deleting.');
        openEdit(r, {forDelete: true});
        return;
      }
      if (
        !confirm(
          'Mark internship inactive, remove Workspace account, and delete portal login?',
        )
      )
        return;
      try {
        await deactivateActiveUser(r);
      } catch (e: any) {
        alert(e?.message || 'Failed to deactivate/delete');
      }
      return;
    }
    if (tab === 'inactive') {
      if (!r.internId) return alert('Missing intern id.');
      if (!confirm('Permanently delete this inactive intern and related data?'))
        return;
      try {
        const res = await fetchWithAuth(
          `/api/admin/users/intern/${r.internId}`,
          {method: 'DELETE'},
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${res.status}`);
        }
        alert('Inactive intern deleted.');
        await loadRows('inactive');
      } catch (e: any) {
        alert(e?.message || 'Failed to delete inactive intern');
      }
      return;
    }
  };

  const openUpdateLog = async (r: Row) => {
    setUpdateLogUser(r);
    setShowUpdateLog(true);
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (r.userId) params.append('userId', String(r.userId));
      if (r.internId) params.append('internId', r.internId);
      params.append('limit', '100');
      const response = await fetchWithAuth(`/api/logs/user-updates?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setUpdateLogs(data.logs || []);
    } catch (err) {
      console.error(err);
      setUpdateLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openEdit = (r: Row, opts?: {forDelete?: boolean}) => {
    setPendingDelete(opts?.forDelete ? r : null);
    setEdit(r);
    setEditName(r.name || '');
    setEditStart(r.joiningDate?.slice(0, 10) || '');
    setEditEnd(r.leavingDate?.slice(0, 10) || '');
    setEditPhone(r.phone || '');
    setEditPersonalEmail(r.personalEmail || '');
    setEditNationality(r.nationality || '');
    setEditGender((r.gender || '') as any);
    setEditSupervisor(r.supervisor || '');
    setEditBirthdate(r.dob ? r.dob.slice(0, 10) : '');
    setEditRole(r.role);
    setEditSupervisor(r.supervisor || '');

    (async () => {
      if (!r.userId) return;
      try {
        const resp = await fetchWithAuth(`/api/admin/users/${r.userId}/detail`);
        if (resp.ok) {
          const j = await resp.json();
          if (j?.empType) setEditEmpType(normalizeEmpType(j.empType));
        }
      } catch {}
    })();

    (async () => {
      const rows = await loadDepartmentsFull();
      const dep = rows.find(
        d =>
          (d.departmentName || '').toLowerCase() ===
          (r.department || '').toLowerCase(),
      );
      setEditDeptId(dep?.id ?? null);
      const pos = dep?.positions?.find(
        p => (p.name || '').toLowerCase() === (r.position || '').toLowerCase(),
      );
      setEditPosId(pos?.id ?? null);
    })();
  };

  const saveEdit = async (opts?: {thenDelete?: boolean}) => {
    const target = edit;
    if (!target?.internId) {
      setEdit(null);
      setPendingDelete(null);
      return;
    }
    if (opts?.thenDelete && !editEnd) {
      alert('Please set the End date before deleting.');
      return;
    }
    if (editDeptId != null) {
      const dep = depts.find(d => d.id === editDeptId);
      if (!dep) return alert('Invalid department');
      if (editPosId == null || !dep.positions.some(p => p.id === editPosId)) {
        return alert('Select a position that belongs to the chosen department');
      }
    }
    try {
      await fetchWithAuth(`/api/users/admin/users/intern/${target.internId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          startDate: editStart || null,
          endDate: editEnd || null,
          supervisor: editSupervisor || null,
          departmentId: editDeptId,
          positionId: editPosId,
          phone: editPhone || null,
          personalEmail: editPersonalEmail || null,
          nationality: editNationality || null,
          gender: editGender || null,
          birthdate: editBirthdate || null,
          name: editName || null,
          userId: target.userId,
          role: isSA ? editRole : undefined,
        }),
      });
      if (target?.userId && target.companyEmail) {
        await fetchWithAuth('/api/admin/users', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            companyEmail: target.companyEmail,
            updates: {empType: editEmpType},
          }),
        }).catch(() => {});
      }
      setEdit(null);
      setPendingDelete(null);
      if (opts?.thenDelete) {
        await deactivateActiveUser(target);
      } else {
        await loadRows();
      }
    } catch {
      alert('Failed to save changes');
    }
  };

  const openDetails = async (r: Row) => {
    setView(r);
    setViewDetail(null);
    setOpenMenuId(null); // close menu
    try {
      let resp: Response | null = null;
      if (r.userId) {
        resp = await fetchWithAuth(`/api/admin/users/${r.userId}/detail`);
      } else if (r.internId) {
        resp = await fetchWithAuth(
          `/api/admin/users/detail-by-intern/${r.internId}`,
        );
      }
      if (resp && resp.ok) setViewDetail(await resp.json());
    } catch {}
  };

  // Filter Logic
  const filtered = useMemo(() => {
    const activeOnly = tab;
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (((r.status ?? 'inactive') as string).toLowerCase() !== activeOnly)
        return false;
      if (dep !== 'all' && r.department !== dep) return false;
      if (gen !== 'all' && (r.gender || '').toLowerCase() !== gen) return false;
      if (country && r.nationality !== country) return false;
      if (needle) {
        const hay = [
          r.name,
          r.companyEmail || '',
          r.personalEmail || '',
          r.employeeId || '',
          r.department || '',
          r.position || '',
          r.nationality || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, tab, dep, gen, country, q]);

  const resetFilters = () => {
    setQ('');
    setDep('all');
    setGen('all');
    setCountry('');
  };

  // Main Render
  if (loading)
    return <main className="p-8 text-center text-gray-500">Loading...</main>;
  if (!isStaff)
    return <main className="p-8 text-center text-red-500">Access Denied</main>;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen bg-white dark:bg-black font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            User Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage employees, interns, and system access.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/import-users"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Upload size={16} /> Import
          </Link>
          <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex shadow-inner">
            <button
              onClick={() => setTab('active')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === 'active'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setTab('inactive')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === 'inactive'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative col-span-1 md:col-span-2">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 rounded-full text-sm transition-all"
              placeholder="Search by name, email, department..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="col-span-1">
            <select
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-transparent rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/20"
              value={dep}
              onChange={e => setDep(e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1 flex items-center gap-2">
            <button
              onClick={resetFilters}
              className="w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role / Dept
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Position
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((r, i) => (
                <tr
                  key={r.userId || r.internId || i}
                  className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors h-16"
                >
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} />
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          {r.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-light">
                          {r.companyEmail || r.personalEmail || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex gap-1">
                        <RolePill label={roleLabel(r.role)} />
                        {r.empType && r.empType !== 'intern' && (
                          <RolePill label={normalizeEmpType(r.empType)} />
                        )}
                      </div>
                      {r.department && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-0.5">
                          {r.department}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-6 text-sm text-gray-700 dark:text-gray-300">
                    {r.position || '—'}
                  </td>
                  <td className="py-3 px-6">
                    <StatusBadge status={r.status} blocked={r.blocked} />
                  </td>
                  <td className="py-3 px-6 text-right relative">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(
                          openMenuId === (r.internId || String(i))
                            ? null
                            : r.internId || String(i),
                        );
                      }}
                      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {/* Action Dropdown */}
                    {openMenuId === (r.internId || String(i)) && (
                      <>
                        <div
                          className="fixed inset-0 z-20 cursor-default"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-8 top-10 z-30 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                          <button
                            onClick={() => openDetails(r)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <UserIcon size={14} /> View Details
                          </button>
                          <button
                            onClick={() => {
                              openEdit(r);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <Edit2 size={14} /> Edit User
                          </button>
                          <button
                            onClick={() => {
                              openUpdateLog(r);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <ClipboardList size={14} /> History
                          </button>
                          <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                          {r.userId != null &&
                            isSA &&
                            (r.blocked ? (
                              <button
                                onClick={async () => {
                                  try {
                                    await unblockUser(r.userId!);
                                    await loadRows(tab);
                                  } catch {
                                    alert('Failed');
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2"
                              >
                                <Unlock size={14} /> Unblock Access
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (!confirm('Block access?')) return;
                                  try {
                                    await blockUser(r.userId!);
                                    await loadRows(tab);
                                  } catch {
                                    alert('Failed');
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2"
                              >
                                <Lock size={14} /> Block Access
                              </button>
                            ))}
                          <button
                            onClick={() => {
                              handleDelete(r);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    No users found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Drawer (Details) */}
      <SideDrawer
        isOpen={!!view}
        onClose={() => setView(null)}
        title={
          <div className="flex items-center gap-3">
            <Avatar name={view?.name || 'User'} size="md" />
            <div>
              <div className="text-lg font-bold leading-tight">
                {view?.name}
              </div>
              <div className="text-xs text-gray-500 font-normal">
                {view?.role}
              </div>
            </div>
          </div>
        }
        actions={
          <button
            onClick={() => {
              if (view) openEdit(view);
            }}
            className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium hover:bg-blue-100 transition-colors"
          >
            Edit
          </button>
        }
      >
        {view && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                icon={<Mail size={16} />}
                label="Company Email"
                value={view.companyEmail}
              />
              <DetailItem
                icon={<Phone size={16} />}
                label="Phone"
                value={view.phone}
              />
              <DetailItem
                icon={<Briefcase size={16} />}
                label="Department"
                value={view.department}
              />
              <DetailItem
                icon={<Briefcase size={16} />}
                label="Position"
                value={view.position}
              />
              <DetailItem
                icon={<Calendar size={16} />}
                label="Joined"
                value={dmy(view.joiningDate)}
              />
              <DetailItem
                icon={<Calendar size={16} />}
                label="Leaving"
                value={dmy(view.leavingDate)}
              />
              <DetailItem
                icon={<UserIcon size={16} />}
                label="Supervisor"
                value={view.supervisor}
              />
              <DetailItem
                icon={<UserIcon size={16} />}
                label="Employee ID"
                value={view.employeeId}
              />
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800" />

            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Personal Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                icon={<Mail size={16} />}
                label="Personal Email"
                value={viewDetail?.personalEmail || view.personalEmail}
              />
              <DetailItem
                icon={<UserIcon size={16} />}
                label="Gender"
                value={viewDetail?.gender || view.gender}
              />
              <DetailItem
                icon={<UserIcon size={16} />}
                label="Nationality"
                value={viewDetail?.nationality || view.nationality}
              />
              <DetailItem
                icon={<Calendar size={16} />}
                label="Birthdate"
                value={dmy(viewDetail?.birthdate || view.dob)}
              />
            </div>

            {viewDetail?.sos && (
              <>
                <div className="h-px bg-gray-100 dark:bg-gray-800" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Emergency Contact
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    icon={<Phone size={16} />}
                    label="SOS Phone"
                    value={viewDetail.sos.phone}
                  />
                  <DetailItem
                    icon={<UserIcon size={16} />}
                    label="Relation"
                    value={viewDetail.sos.relation}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </SideDrawer>

      {/* Edit Modal (Preserved & Styled) */}
      {edit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEdit(null)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Edit User
              </h3>
              <button
                onClick={() => setEdit(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                  Name
                </label>
                <input
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Department
                  </label>
                  <select
                    className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    value={editDeptId ?? ''}
                    onChange={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setEditDeptId(v);
                      setEditPosId(null);
                    }}
                  >
                    <option value="">—</option>
                    {depts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.departmentName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Position
                  </label>
                  <select
                    className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    value={editPosId ?? ''}
                    disabled={editDeptId == null}
                    onChange={e =>
                      setEditPosId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">—</option>
                    {(
                      depts.find(d => d.id === editDeptId)?.positions || []
                    ).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Other Fields */}
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="Phone"
                  className="p-2 border border-gray-200 rounded-lg"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                />
                <input
                  placeholder="Personal Email"
                  type="email"
                  className="p-2 border border-gray-200 rounded-lg"
                  value={editPersonalEmail}
                  onChange={e => setEditPersonalEmail(e.target.value)}
                />
              </div>

              {/* Role/Supervisor */}
              <div className="grid grid-cols-2 gap-4">
                <input
                  placeholder="Supervisor"
                  className="p-2 border border-gray-200 rounded-lg"
                  value={editSupervisor}
                  onChange={e => setEditSupervisor(e.target.value)}
                />
                {isSA && (
                  <select
                    className="p-2 border border-gray-200 rounded-lg"
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as any)}
                  >
                    <option value="intern">Intern</option>
                    <option value="hr">HR</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800">
              <button
                onClick={() => setEdit(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              {pendingDelete ? (
                <button
                  onClick={() => saveEdit({thenDelete: true})}
                  disabled={!edit?.internId || !editEnd}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Save & Delete
                </button>
              ) : (
                <button
                  onClick={() => saveEdit()}
                  disabled={!edit?.internId}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Update Log Modal */}
      {showUpdateLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowUpdateLog(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                History: {updateLogUser?.name}
              </h2>
              <button onClick={() => setShowUpdateLog(false)}>
                <X />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-0">
              {loadingLogs ? (
                <div className="p-10 text-center">Loading...</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="p-3 font-semibold text-gray-500">Date</th>
                      <th className="p-3 font-semibold text-gray-500">Field</th>
                      <th className="p-3 font-semibold text-gray-500">Old</th>
                      <th className="p-3 font-semibold text-gray-500">New</th>
                      <th className="p-3 font-semibold text-gray-500">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {updateLogs.map(log => (
                      <tr key={log.id}>
                        <td className="p-3 text-gray-600">
                          {new Date(log.updatedAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium">{log.fieldName}</td>
                        <td className="p-3 text-red-600 break-words max-w-xs">
                          {log.oldValue || '—'}
                        </td>
                        <td className="p-3 text-green-600 break-words max-w-xs">
                          {log.newValue || '—'}
                        </td>
                        <td className="p-3 text-gray-600">
                          {log.updatedByName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-200 mt-0.5">
          {value || '—'}
        </div>
      </div>
    </div>
  );
}
