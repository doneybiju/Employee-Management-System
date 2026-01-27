// frontend/src/pages/admin/users.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import {blockUser, unblockUser} from '@/lib/api';
import Drawer from '@/components/Drawer';
import Dropdown from '@/components/Dropdown';
import {
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FileText,
  Trash2,
  Lock,
  Unlock,
  History,
} from 'lucide-react';
import CountrySelect from '@/components/CountrySelect';

/* ================= Types ================= */
type EmpType = 'intern' | 'employee' | 'team_lead';

type Row = {
  userId: number | null;
  employeeId: string | null; // FIXED: Renamed from internId to employeeId to match backend
  role: 'intern' | 'hr' | 'super_admin';
  name: string;
  department: string | null;
  position: string | null;
  companyEmail: string | null;
  phone: string | null;
  empId: string | null;
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

// department/position types
type Dept = {
  id: number;
  departmentName: string;
  positions: {id: number; name: string}[];
};

export default function AdminUsers() {
  const {user, loading} = useAuth();
  const role = user?.role ?? 'intern';
  const isHR = role === 'hr';
  const isSA = role === 'super_admin';
  const isStaff = isHR || isSA;

  // Data State
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [loadingData, setLoadingData] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<
    'edit' | 'details' | 'logs' | null
  >(null);
  const [selectedUser, setSelectedUser] = useState<Row | null>(null);

  // Edit Form State
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
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editPosId, setEditPosId] = useState<number | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);

  // Details State
  const [viewDetail, setViewDetail] = useState<any | null>(null);

  // Logs State
  const [updateLogs, setUpdateLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Filters
  const [q, setQ] = useState('');

  // ========== Load Data ==========
  const loadRows = async (whichTab: Tab = tab) => {
    setLoadingData(true);
    try {
      const res = await fetchWithAuth(`/api/admin/users?tab=${whichTab}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setCurrentPage(1); // Reset to page 1 on tab change or reload
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!loading && isStaff) loadRows(tab);
  }, [loading, tab, isStaff]);

  // Load departments for edit form
  async function loadDepartmentsFull(): Promise<Dept[]> {
    try {
      const res = await fetchWithAuth('/api/departments/full');
      const arr = await res.json();
      const list = Array.isArray(arr) ? (arr as Dept[]) : [];
      setDepts(list);
      return list;
    } catch {
      return [];
    }
  }

  // ========== Actions ==========

  const handleEdit = async (r: Row) => {
    setSelectedUser(r);
    setDrawerMode('edit');
    setDrawerOpen(true);

    // Populate form
    setEditName(r.name || '');
    setEditStart(r.joiningDate?.slice(0, 10) || '');
    setEditEnd(r.leavingDate?.slice(0, 10) || '');
    setEditPhone(r.phone || '');
    setEditPersonalEmail(r.personalEmail || '');
    setEditNationality(r.nationality || '');
    setEditGender(r.gender || '');
    setEditSupervisor(r.supervisor || '');
    setEditBirthdate(r.dob ? r.dob.slice(0, 10) : '');
    setEditRole(r.role);

    // Async data
    if (r.userId) {
      fetchWithAuth(`/api/admin/users/${r.userId}/detail`)
        .then(res => res.json())
        .then(j => {
          if (j?.empType) setEditEmpType(normalizeEmpType(j.empType));
        })
        .catch(() => {});
    }

    const deptList = await loadDepartmentsFull();
    const dep = deptList.find(
      d =>
        (d.departmentName || '').toLowerCase() ===
        (r.department || '').toLowerCase(),
    );
    setEditDeptId(dep?.id ?? null);
    const pos = dep?.positions?.find(
      p => (p.name || '').toLowerCase() === (r.position || '').toLowerCase(),
    );
    setEditPosId(pos?.id ?? null);
  };

  const saveEdit = async (opts?: {thenDelete?: boolean}) => {
    const target = selectedUser;
    // FIXED: Check for employeeId instead of internId
    if (!target?.employeeId) return;

    if (opts?.thenDelete && !editEnd) {
      alert('Please set the End date before deleting.');
      return;
    }

    try {
      // FIXED: Use employeeId in URL
      await fetchWithAuth(
        `/api/users/admin/users/intern/${target.employeeId}`,
        {
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
        },
      );

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

      if (opts?.thenDelete) {
        await deactivateActiveUser(target);
      } else {
        await loadRows();
        setDrawerOpen(false);
      }
    } catch {
      alert('Failed to save changes');
    }
  };

  const handleDetails = async (r: Row) => {
    setSelectedUser(r);
    setViewDetail(null);
    setDrawerMode('details');
    setDrawerOpen(true);

    try {
      let resp: Response | null = null;
      if (r.userId) {
        resp = await fetchWithAuth(`/api/admin/users/${r.userId}/detail`);
      } else if (r.employeeId) {
        // FIXED: Use employeeId in URL
        resp = await fetchWithAuth(
          `/api/admin/users/detail-by-intern/${r.employeeId}`,
        );
      }
      if (resp && resp.ok) setViewDetail(await resp.json());
    } catch {}
  };

  const handleLogs = async (r: Row) => {
    setSelectedUser(r);
    setUpdateLogs([]);
    setDrawerMode('logs');
    setDrawerOpen(true);
    setLoadingLogs(true);

    try {
      const params = new URLSearchParams();
      if (r.userId) params.append('userId', String(r.userId));
      // FIXED: Use employeeId for param value
      if (r.employeeId) params.append('internId', r.employeeId);
      params.append('limit', '50');

      const response = await fetchWithAuth(`/api/logs/user-updates?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUpdateLogs(data.logs || []);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  // Helper for delete logic (copied from original)
  const deactivateActiveUser = async (r: Row) => {
    const res = await fetchWithAuth('/api/admin/users/deactivate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      // FIXED: Send employeeId in body as expected by backend
      body: JSON.stringify({
        userId: r.userId,
        employeeId: r.employeeId,
        companyEmail: r.companyEmail,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (j?.error === 'end_date_required') {
        alert(
          'End date is required. Please set the end date in the Edit form.',
        );
        return;
      }
      throw new Error(j?.error || `HTTP ${res.status}`);
    }
    alert('User deactivated/deleted successfully.');
    setDrawerOpen(false);
    await loadRows('active');
  };

  const handleDelete = async (r: Row) => {
    if (tab === 'active') {
      // FIXED: Use employeeId
      if (r.employeeId && !r.leavingDate) {
        alert(
          'End date is required before deleting. Opening edit form to set end date.',
        );
        handleEdit(r);
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
        alert(e?.message);
      }
    } else {
      if (!confirm('Permanently delete this inactive intern and related data?'))
        return;
      try {
        // FIXED: Use employeeId in URL
        await fetchWithAuth(`/api/admin/users/intern/${r.employeeId}`, {
          method: 'DELETE',
        });
        alert('Inactive intern deleted.');
        loadRows('inactive');
      } catch {
        alert('Failed to delete.');
      }
    }
  };

  const handleBlockToggle = async (r: Row) => {
    if (!r.userId) return;
    if (r.blocked) {
      await unblockUser(r.userId);
    } else {
      if (!confirm('Revoke portal access?')) return;
      await blockUser(r.userId);
    }
    loadRows();
  };

  // ========== Filtering & Pagination ==========
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      [
        r.name,
        r.companyEmail,
        r.personalEmail,
        r.empId,
        r.department,
        r.position,
        r.nationality,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  if (!isStaff) {
    if (loading) return null;
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Access Denied.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0 pl-16">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
          User Management
        </h1>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/import-users"
            className="hidden md:inline-flex items-center px-4 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            Import CSV
          </Link>
          <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
            <button
              onClick={() => setTab('active')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                tab === 'active'
                  ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setTab('inactive')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                tab === 'inactive'
                  ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search users..."
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>
        <div className="text-sm text-gray-500">
          Showing{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {filteredRows.length}
          </span>{' '}
          users
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-[#111] shadow-sm flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/90 dark:bg-[#111]/90 backdrop-blur sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  User
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Role
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Department
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  Status
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loadingData ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map(r => (
                  // FIXED: Use employeeId in key
                  <tr
                    key={r.employeeId || r.userId}
                    className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {getInitials(r.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {r.name}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {r.companyEmail || r.personalEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {r.role === 'intern' ? 'Intern' : r.role}
                        </span>
                        {r.empType && r.empType !== 'intern' && (
                          <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded w-fit mt-0.5">
                            {r.empType.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {r.department || '—'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.position || '—'}
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'active' || !r.status
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {r.status || 'Active'}
                      </span>
                      {r.blocked && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Dropdown>
                        <div className="py-1 min-w-[160px]">
                          <button
                            onClick={() => handleEdit(r)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                          >
                            <Edit2 size={16} /> Edit
                          </button>
                          <button
                            onClick={() => handleDetails(r)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                          >
                            <FileText size={16} /> Details
                          </button>
                          <button
                            onClick={() => handleLogs(r)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                          >
                            <History size={16} /> History
                          </button>
                          {isSA && r.userId && (
                            <button
                              onClick={() => handleBlockToggle(r)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2"
                            >
                              {r.blocked ? (
                                <>
                                  <Unlock size={16} /> Unblock
                                </>
                              ) : (
                                <>
                                  <Lock size={16} /> Block
                                </>
                              )}
                            </button>
                          )}
                          <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                          <button
                            onClick={() => handleDelete(r)}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      </Dropdown>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-[#111] flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Side Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          drawerMode === 'edit'
            ? 'Edit User'
            : drawerMode === 'logs'
              ? 'Update History'
              : 'User Details'
        }
        width={drawerMode === 'logs' ? 'w-[700px]' : 'w-[500px]'}
      >
        {drawerMode === 'edit' && selectedUser && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-4">
                Profile Information
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  // NEW className for ALL Inputs/Selects in Edit Drawer
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    value={editPersonalEmail}
                    onChange={e => setEditPersonalEmail(e.target.value)}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone
                  </label>
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Country
                  </label>
                  <CountrySelect
                    value={editNationality}
                    onChange={setEditNationality}
                    label=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value)}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="others">Others</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-4">
                Role & Department
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Department
                  </label>
                  <select
                    value={editDeptId ?? ''}
                    onChange={e => {
                      setEditDeptId(e.target.value ? +e.target.value : null);
                      setEditPosId(null);
                    }}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Select...</option>
                    {depts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.departmentName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Position
                  </label>
                  <select
                    value={editPosId ?? ''}
                    disabled={!editDeptId}
                    onChange={e =>
                      setEditPosId(e.target.value ? +e.target.value : null)
                    }
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Select...</option>
                    {depts
                      .find(d => d.id === editDeptId)
                      ?.positions.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supervisor
                </label>
                <input
                  value={editSupervisor}
                  onChange={e => setEditSupervisor(e.target.value)}
                  // NEW className for ALL Inputs/Selects in Edit Drawer
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                    // NEW className for ALL Inputs/Selects in Edit Drawer
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
              {isSA && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      System Role
                    </label>
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as any)}
                      // NEW className for ALL Inputs/Selects in Edit Drawer
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="intern">User</option>
                      <option value="hr">HR</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Employment Type
                    </label>
                    <select
                      value={editEmpType}
                      onChange={e => setEditEmpType(e.target.value as EmpType)}
                      // NEW className for ALL Inputs/Selects in Edit Drawer
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="intern">Intern</option>
                      <option value="employee">Employee</option>
                      <option value="team_lead">Team Lead</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => saveEdit()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  if (confirm('Deactivate and Delete this user?')) {
                    saveEdit({thenDelete: true});
                  }
                }}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors"
              >
                Deactivate & Delete
              </button>
            </div>
          </div>
        )}

        {drawerMode === 'details' && selectedUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-2xl">
                {getInitials(selectedUser.name)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedUser.name}
                </h3>
                <p className="text-gray-500">
                  {selectedUser.companyEmail || selectedUser.personalEmail}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase text-gray-500">
                Work Information
              </h4>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Department</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedUser.department || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Position</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedUser.position || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Supervisor</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {viewDetail?.supervisor || selectedUser.supervisor || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Status</p>
                  <p className="font-medium capitalize text-gray-900 dark:text-white">
                    {selectedUser.status || 'Active'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Start Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {dmy(viewDetail?.startDate || selectedUser.joiningDate)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">End Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {dmy(viewDetail?.endDate || selectedUser.leavingDate)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase text-gray-500">
                Personal Information
              </h4>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Phone</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {viewDetail?.phone || selectedUser.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Nationality</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {viewDetail?.nationality || selectedUser.nationality || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Gender</p>
                  <p className="font-medium capitalize text-gray-900 dark:text-white">
                    {viewDetail?.gender || selectedUser.gender || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">DOB</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {dmy(viewDetail?.birthdate || selectedUser.dob)}
                  </p>
                </div>
              </div>
            </div>

            {viewDetail?.sos && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold uppercase text-gray-500">
                  Emergency Contact
                </h4>
                <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg">
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-red-500 text-xs">Phone</p>
                      <p className="font-medium text-red-700">
                        {viewDetail.sos.phone || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-red-500 text-xs">Relation</p>
                      <p className="font-medium text-red-700">
                        {viewDetail.sos.relation || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {drawerMode === 'logs' && (
          <div className="space-y-4">
            {loadingLogs ? (
              <div className="text-center p-8 text-gray-500">
                Loading history...
              </div>
            ) : updateLogs.length === 0 ? (
              <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg">
                No update history found.
              </div>
            ) : (
              <div className="space-y-4">
                {updateLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-gray-400">
                        {new Date(log.updatedAt).toLocaleString()}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                        {log.updatedByName}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-semibold text-gray-900 dark:text-gray-200">
                        {log.fieldName}
                      </span>{' '}
                      changed from{' '}
                      <span className="text-red-500 dark:text-red-400 line-through">
                        {log.oldValue || 'empty'}
                      </span>{' '}
                      to{' '}
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {log.newValue || 'empty'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}