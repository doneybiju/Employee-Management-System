// frontend/src/pages/admin/users.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth, blockUser, unblockUser} from '@/lib/api';
import CountrySelect from '@/components/CountrySelect';
import {
  Pencil,
  ClipboardList,
  Unlock,
  Lock,
  Trash2,
  Upload,
  X,
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

type ColId =
  | 'name'
  | 'companyEmail'
  | 'department'
  | 'position'
  | 'gender'
  | 'nationality'
  | 'status'
  | 'empID'
  | 'phone'
  | 'startDate'
  | 'endDate'
  | 'personalEmail'
  | 'birthdate'
  | 'supervisor'
  | 'role'
  | 'empType';

type ColCfg = {
  selectable: boolean;
  cols: ColId[];
  role: 'hr' | 'super_admin';
  version: number;
  updatedAt: string;
};

const normalizeEmpType = (v?: string | null): EmpType =>
  v === 'owner' ? 'team_lead' : (v as EmpType) || 'intern';

const roleLabel = (role: Row['role']) => (role === 'intern' ? 'EMP' : role);

const ALL_COLS: {id: ColId; label: string}[] = [
  {id: 'name', label: 'Name'},
  {id: 'companyEmail', label: 'Company Email'},
  {id: 'department', label: 'Department'},
  {id: 'position', label: 'Position'},
  {id: 'gender', label: 'Gender'},
  {id: 'nationality', label: 'Country'},
  {id: 'status', label: 'Status'},
  {id: 'empID', label: 'Employee ID'},
  {id: 'phone', label: 'Phone'},
  {id: 'startDate', label: 'Start'},
  {id: 'endDate', label: 'End'},
  {id: 'personalEmail', label: 'Personal Email'},
  {id: 'birthdate', label: 'DOB'},
  {id: 'supervisor', label: 'Supervisor'},
  {id: 'role', label: 'Role'},
  {id: 'empType', label: 'Emp Type'},
];

/* Fixed table columns (always these 6) */
const TABLE_COLS: ColId[] = [
  'name',
  'companyEmail',
  'department',
  'position',
  'startDate',
  'endDate',
];

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

// Reusable Tailwind classes
const INPUT_CLASS =
  'w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500';
const LABEL_CLASS =
  'text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block';

const ACTION_BTN_BASE =
  'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors';
const ACTION_BTN_BLUE = `${ACTION_BTN_BASE} hover:text-blue-600`;
const ACTION_BTN_RED = `${ACTION_BTN_BASE} hover:text-red-600`;
const ACTION_BTN_GREEN = `${ACTION_BTN_BASE} hover:text-green-600`;

// Side Drawer Component
function SideDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      {/* Drawer Panel */}
      <aside
        className={`fixed inset-y-0 right-0 w-[500px] bg-white dark:bg-[#111] z-50 transform transition-transform duration-300 shadow-2xl flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {children}
      </aside>
    </>
  );
}

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

  // Filters
  const [q, setQ] = useState('');
  const [dep, setDep] = useState<string>('all');
  const [gen, setGen] = useState<string>('all');
  const [country, setCountry] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);

  // Drawer & Selection State
  const [selectedUser, setSelectedUser] = useState<Row | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'edit' | 'history'>(
    'details',
  );

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Columns Config
  const [cfg, setCfg] = useState<ColCfg | null>(null);
  const versionRef = useRef<number>(0);

  // Edit State (Form)
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPersonalEmail, setEditPersonalEmail] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editSupervisor, setEditSupervisor] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');
  const [editRole, setEditRole] = useState<'intern' | 'hr' | 'super_admin'>(
    'intern',
  );
  const [editEmpType, setEditEmpType] = useState<EmpType>('intern');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editPosId, setEditPosId] = useState<number | null>(null);

  type Dept = {
    id: number;
    departmentName: string;
    positions: {id: number; name: string}[];
  };
  const [depts, setDepts] = useState<Dept[]>([]);

  // Details State
  const [viewDetail, setViewDetail] = useState<any | null>(null);

  // History State
  const [updateLogs, setUpdateLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ========== Initialization ==========

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
    try {
      const res = await fetchWithAuth('/api/departments/full');
      const arr = (await res.json()) as Dept[] | unknown;
      const list = Array.isArray(arr) ? (arr as Dept[]) : [];
      setDepts(list);
      return list;
    } catch {
      return [];
    }
  }

  const loadColumns = async () => {
    try {
      const res = await fetchWithAuth('/api/users/admin/users/columns');
      const data: ColCfg = await res.json();
      setCfg(data);
      versionRef.current = data.version || 0;
    } catch {}
  };

  useEffect(() => {
    loadColumns();
  }, []);

  // ========== Filtering & Pagination ==========

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

  useEffect(() => {
    setCurrentPage(1);
  }, [q, dep, gen, country, tab]);

  const totalUsers = filtered.length;
  const totalPages = Math.ceil(totalUsers / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalUsers);
  const currentRows = filtered.slice(startIndex, startIndex + rowsPerPage);

  const resetFilters = () => {
    setQ('');
    setDep('all');
    setGen('all');
    setCountry('');
  };

  // ========== Actions ==========

  const openDrawer = async (
    r: Row,
    mode: 'details' | 'edit' | 'history' = 'details',
  ) => {
    setSelectedUser(r);
    setDrawerTab(mode);

    // Reset/Load data based on mode
    if (mode === 'edit') {
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

      // Async loads
      if (r.userId) {
        fetchWithAuth(`/api/admin/users/${r.userId}/detail`)
          .then(res => res.json())
          .then(j => {
            if (j?.empType) setEditEmpType(normalizeEmpType(j.empType));
          })
          .catch(() => {});
      } else {
        setEditEmpType(normalizeEmpType(r.empType));
      }

      const dList = await loadDepartmentsFull();
      const d = dList.find(
        x =>
          (x.departmentName || '').toLowerCase() ===
          (r.department || '').toLowerCase(),
      );
      setEditDeptId(d?.id ?? null);
      const p = d?.positions.find(
        x => (x.name || '').toLowerCase() === (r.position || '').toLowerCase(),
      );
      setEditPosId(p?.id ?? null);
    } else if (mode === 'details') {
      setViewDetail(null);
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
    } else if (mode === 'history') {
      setLoadingLogs(true);
      setUpdateLogs([]);
      try {
        const params = new URLSearchParams();
        if (r.userId) params.append('userId', String(r.userId));
        if (r.internId) params.append('internId', r.internId);
        params.append('limit', '100');

        const response = await fetchWithAuth(
          `/api/logs/user-updates?${params}`,
        );
        if (response.ok) {
          const data = await response.json();
          setUpdateLogs(data.logs || []);
        }
      } catch {
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  const closeDrawer = () => {
    setSelectedUser(null);
  };

  const saveEdit = async (opts?: {thenDelete?: boolean}) => {
    if (!selectedUser?.internId) return;

    if (opts?.thenDelete && !editEnd) {
      alert('Please set the End date before deleting.');
      return;
    }

    try {
      await fetchWithAuth(
        `/api/users/admin/users/intern/${selectedUser.internId}`,
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
            userId: selectedUser.userId,
            role: isSA ? editRole : undefined,
          }),
        },
      );

      if (selectedUser.userId && selectedUser.companyEmail) {
        await fetchWithAuth('/api/admin/users', {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            companyEmail: selectedUser.companyEmail,
            updates: {empType: editEmpType},
          }),
        }).catch(() => {});
      }

      if (opts?.thenDelete) {
        await deactivateActiveUser(selectedUser);
      } else {
        await loadRows();
      }
      closeDrawer();
    } catch {
      alert('Failed to save changes');
    }
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
    if (!res.ok) {
      alert('Failed to delete/deactivate user');
      return;
    }
    alert('User deactivated/deleted successfully');
    await loadRows('active');
  };

  const handleDelete = async (r: Row) => {
    if (tab === 'active') {
      if (r.internId && !r.leavingDate) {
        alert(
          'End date is required before deleting. Set the end date via Edit, then delete.',
        );
        openDrawer(r, 'edit');
        return;
      }
      if (!confirm('Mark internship inactive and remove account?')) return;
      try {
        await deactivateActiveUser(r);
      } catch (e: any) {
        alert(e.message);
      }
    } else {
      // inactive
      if (!r.internId) return;
      if (!confirm('Permanently delete this inactive intern?')) return;
      await fetchWithAuth(`/api/admin/users/intern/${r.internId}`, {
        method: 'DELETE',
      });
      await loadRows('inactive');
    }
  };

  // ========== UI Render Helpers ==========

  const thLabel = (id: ColId) => ALL_COLS.find(c => c.id === id)?.label || id;

  const renderCells = (r: Row) => (
    <>
      <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-[240px] truncate">
        {r.name}
      </td>
      <td className="px-6 py-4 text-sm text-gray-700 max-w-[260px] truncate">
        {r.companyEmail || '—'}
      </td>
      <td className="px-6 py-4 text-sm text-gray-700">{r.department || '—'}</td>
      <td className="px-6 py-4 text-sm text-gray-700">{r.position || '—'}</td>
      <td className="px-6 py-4 text-sm text-gray-700">{dmy(r.joiningDate)}</td>
      <td className="px-6 py-4 text-sm text-gray-700">{dmy(r.leavingDate)}</td>
      <td className="px-6 py-4 text-sm">
        <button
          onClick={() => openDrawer(r, 'details')}
          className="px-3 py-1 bg-white border border-blue-200 text-blue-600 rounded-md text-sm hover:bg-blue-50 transition-colors"
        >
          Details
        </button>
      </td>
      <td className="px-6 py-4 text-sm">
        <div className="flex gap-2">
          <button onClick={() => openDrawer(r, 'edit')} className={ACTION_BTN_BLUE}>
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDrawer(r, 'history')}
            className={ACTION_BTN_BLUE}
          >
            <ClipboardList className="w-4 h-4" />
          </button>
          {r.userId != null && isSA && (
            <button
              onClick={async () => {
                if (r.blocked) await unblockUser(r.userId!);
                else await blockUser(r.userId!);
                loadRows();
              }}
              className={r.blocked ? ACTION_BTN_GREEN : ACTION_BTN_RED}
            >
              {r.blocked ? (
                <Unlock className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </button>
          )}
          <button onClick={() => handleDelete(r)} className={ACTION_BTN_RED}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </>
  );

  const renderDrawerContent = () => {
    if (!selectedUser) return null;

    if (drawerTab === 'edit') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label>
              <div className={LABEL_CLASS}>Name</div>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <div className={LABEL_CLASS}>Emp Type</div>
              <select
                value={editEmpType}
                onChange={e => setEditEmpType(e.target.value as EmpType)}
                className={INPUT_CLASS}
              >
                <option value="intern">intern</option>
                <option value="employee">employee</option>
                {isStaff && <option value="team_lead">team_lead</option>}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <div className={LABEL_CLASS}>Department</div>
              <select
                value={editDeptId ?? ''}
                onChange={e => {
                  setEditDeptId(Number(e.target.value));
                  setEditPosId(null);
                }}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                {depts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.departmentName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className={LABEL_CLASS}>Position</div>
              <select
                value={editPosId ?? ''}
                onChange={e => setEditPosId(Number(e.target.value))}
                className={INPUT_CLASS}
                disabled={editDeptId == null}
              >
                <option value="">—</option>
                {(depts.find(d => d.id === editDeptId)?.positions || []).map(
                  p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <div className={LABEL_CLASS}>Start Date</div>
              <input
                type="date"
                value={editStart}
                onChange={e => setEditStart(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <div className={LABEL_CLASS}>End Date</div>
              <input
                type="date"
                value={editEnd}
                onChange={e => setEditEnd(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <div className={LABEL_CLASS}>Phone</div>
              <input
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <div className={LABEL_CLASS}>Personal Email</div>
              <input
                value={editPersonalEmail}
                onChange={e => setEditPersonalEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <div className={LABEL_CLASS}>Country</div>
              <input
                value={editNationality}
                onChange={e => setEditNationality(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <div className={LABEL_CLASS}>Gender</div>
              <select
                value={editGender}
                onChange={e => setEditGender(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="others">Others</option>
              </select>
            </label>
          </div>

          {isSA && (
            <label>
              <div className={LABEL_CLASS}>Role</div>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value as any)}
                className={INPUT_CLASS}
              >
                <option value="intern">EMP</option>
                <option value="hr">HR</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </label>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <button
              onClick={() => saveEdit({thenDelete: true})}
              className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Save & Delete
            </button>
            <button
              onClick={() => saveEdit()}
              className="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      );
    } else if (drawerTab === 'details') {
      // Build details view
      const vd = viewDetail || {};
      const fields: {l: string; v: string}[] = [
        {l: 'Name', v: vd.name || selectedUser.name},
        {l: 'Email', v: vd.companyEmail || selectedUser.companyEmail || '—'},
        {l: 'Personal Email', v: vd.personalEmail || selectedUser.personalEmail || '—'},
        {l: 'Phone', v: vd.phone || selectedUser.phone || '—'},
        {l: 'Department', v: selectedUser.department || '—'},
        {l: 'Position', v: selectedUser.position || '—'},
        {l: 'Start Date', v: dmy(vd.startDate || selectedUser.joiningDate)},
        {l: 'End Date', v: dmy(vd.endDate || selectedUser.leavingDate)},
        {l: 'SOS Phone', v: vd.sos?.phone || '—'},
        {l: 'SOS Relation', v: vd.sos?.relation || '—'},
      ];

      return (
        <div className="space-y-4">
          {fields.map((f, i) => (
            <div key={i}>
              <div className={LABEL_CLASS}>{f.l}</div>
              <div className="text-sm font-medium">{f.v}</div>
            </div>
          ))}
        </div>
      );
    } else if (drawerTab === 'history') {
      if (loadingLogs) return <div className="text-center p-4">Loading...</div>;
      if (!updateLogs.length)
        return <div className="text-center p-4 text-gray-500">No history</div>;
      return (
        <div className="space-y-4">
          {updateLogs.map(log => (
            <div key={log.id} className="text-xs border-b pb-2">
              <div className="font-semibold">
                {new Date(log.updatedAt).toLocaleString()}
              </div>
              <div className="text-gray-600">
                {log.fieldName}: {log.oldValue} → {log.newValue}
              </div>
              <div className="text-gray-400">by {log.updatedByName}</div>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!isStaff) return <div className="p-8">Access Denied</div>;

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="p-8 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-medium text-gray-900">User Management</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/import-users"
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded shadow-sm hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 inline mr-2" /> Import Users
            </Link>
            {/* Tabs */}
            <div className="flex">
              {(['active', 'inactive'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 border text-sm font-medium transition-colors ${
                    tab === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  } ${t === 'active' ? 'rounded-l-lg border-r-0' : 'rounded-r-lg'}`}
                >
                  {t === 'active' ? 'Active Users' : 'Inactive Users'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              placeholder="Search..."
              value={q}
              onChange={e => setQ(e.target.value)}
              className="input w-full"
            />
            <select
              value={dep}
              onChange={e => setDep(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={gen}
              onChange={e => setGen(e.target.value)}
              className="input w-full"
            >
              <option value="all">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="others">Others</option>
            </select>
            <CountrySelect value={country} onChange={setCountry} label="" allowClear />
            <div className="flex justify-end">
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative mx-8 mb-8 bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-100">
                {TABLE_COLS.map(id => (
                  <th
                    key={id}
                    className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {thLabel(id)}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentRows.map((r, i) => (
                <tr
                  key={r.userId || r.internId || i}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {renderCells(r)}
                </tr>
              ))}
              {currentRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-white border-t border-gray-200 p-4 flex justify-between items-center z-20 shrink-0">
          <span className="text-sm text-gray-700">
            Showing {totalUsers === 0 ? 0 : startIndex + 1} to {endIndex} of {totalUsers} users
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Side Drawer */}
      <SideDrawer isOpen={!!selectedUser} onClose={closeDrawer}>
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Drawer Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {selectedUser?.name || 'User Details'}
              </h2>
              <p className="text-xs text-gray-500">{selectedUser?.companyEmail}</p>
            </div>
            <button
              onClick={closeDrawer}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
            {[
              {id: 'details', label: 'Details'},
              {id: 'edit', label: 'Edit'},
              {id: 'history', label: 'History'},
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setDrawerTab(t.id as any)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  drawerTab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#111]">
            {renderDrawerContent()}
          </div>
        </div>
      </SideDrawer>
    </main>
  );
}
