// frontend/src/pages/admin/users.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import CountrySelect from '@/components/CountrySelect';
import {blockUser, unblockUser} from '@/lib/api';
import {
  Pencil,
  ClipboardList,
  Unlock,
  Lock,
  Trash2,
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
const MODAL_OVERLAY =
  'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm';
const MODAL_CARD =
  'bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border border-gray-100 dark:border-gray-700';
const INPUT_CLASS =
  'w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500';
const LABEL_CLASS =
  'text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block';

const ACTION_BTN_BASE =
  'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors';
const ACTION_BTN_BLUE = `${ACTION_BTN_BASE} hover:text-blue-600`;
const ACTION_BTN_RED = `${ACTION_BTN_BASE} hover:text-red-600`;
const ACTION_BTN_GREEN = `${ACTION_BTN_BASE} hover:text-green-600`;

export default function AdminUsers() {
  const {user, loading} = useAuth();
  const role = user?.role ?? 'intern';
  const isHR = role === 'hr';
  const isSA = role === 'super_admin';
  const isStaff = isHR || isSA;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  const [editStart, setEditStart] = useState<string>('');
  const [editPersonalEmail, setEditPersonalEmail] = useState<string>('');
  const [editNationality, setEditNationality] = useState<string>('');
  const [editGender, setEditGender] = useState<string>(''); // '', 'male', 'female', 'others'
  const [editSupervisor, setEditSupervisor] = useState<string>('');
  const [editBirthdate, setEditBirthdate] = useState<string>(''); // yyyy-mm-dd
  const [editRole, setEditRole] = useState<'intern' | 'hr' | 'super_admin'>(
    'intern',
  );
  const [editEmpType, setEditEmpType] = useState<EmpType>('intern');

  const [editName, setEditName] = useState<string>('');
  const [editingName, setEditingName] = useState<boolean>(false);

  // department/position
  type Dept = {
    id: number;
    departmentName: string;
    positions: {id: number; name: string}[];
  };
  const [depts, setDepts] = useState<Dept[]>([]);
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editPosId, setEditPosId] = useState<number | null>(null);

  // filters
  const [q, setQ] = useState('');
  const [dep, setDep] = useState<string>('all');
  const [gen, setGen] = useState<string>('all');
  const [country, setCountry] = useState<string>('');

  // departments for filter (from API)
  const [departments, setDepartments] = useState<string[]>([]);

  // column config (from backend, versioned) — controls HR detail view only
  const [cfg, setCfg] = useState<ColCfg | null>(null);
  const versionRef = useRef<number>(0);

  // edit modal
  const [edit, setEdit] = useState<Row | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);

  // const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');

  // details modal
  const [view, setView] = useState<Row | null>(null);
  const [viewDetail, setViewDetail] = useState<any | null>(null);

  // Update log modal
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<any[]>([]);
  const [updateLogUser, setUpdateLogUser] = useState<Row | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ========== load rows ==========
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

  // ========== load departments ==========
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

  // load full departments with positions for the Edit modal
  async function loadDepartmentsFull(): Promise<Dept[]> {
    const res = await fetchWithAuth('/api/departments/full');
    const arr = (await res.json()) as Dept[] | unknown;
    const list = Array.isArray(arr) ? (arr as Dept[]) : [];
    setDepts(list);
    return list;
  }

  // ========== load columns once ==========
  const loadColumns = async () => {
    const res = await fetchWithAuth('/api/users/admin/users/columns');
    const data: ColCfg = await res.json();
    setCfg(data);
    versionRef.current = data.version || 0;
  };

  useEffect(() => {
    loadColumns();
  }, []);

  //   // -- departments + positions for edit modal --
  // async function loadDepartmentsFull() {
  //   const rows = await fetchWithAuth('/api/departments/full');
  //   setDepts(Array.isArray(rows) ? rows : []);
  // }

  // ========== HR auto-sync with SA changes (poll every 10s) ==========
  useEffect(() => {
    if (!isHR) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetchWithAuth(
          '/api/users/admin/users/columns/version',
        );
        const v: {version: number} = await res.json();
        const next = Number(v?.version || 0);
        if (next > versionRef.current) await loadColumns();
      } catch {}
    }, 10000);
    return () => clearInterval(timer);
  }, [isHR]);

  // ========== Column selection modal (SA only) ==========
  const [showCols, setShowCols] = useState(false);
  const [localCols, setLocalCols] = useState<Set<ColId>>(new Set());
  useEffect(() => {
    if (!cfg) return;
    setLocalCols(new Set(cfg.cols || []));
  }, [cfg, showCols]);

  const saveCols = async () => {
    if (!isHR) return;
    const body = {cols: Array.from(localCols)};
    const res = await fetchWithAuth('/api/admin/users/columns', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const saved = await res.json();
    setCfg({...(cfg as any), ...saved, cols: body.cols});
    versionRef.current = (saved as any)?.version || versionRef.current + 1;
    setShowCols(false);
  };

  // ========== filtering + tab ==========
  const filtered = useMemo(() => {
    const activeOnly = tab;
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (((r.status ?? 'inactive') as string).toLowerCase() !== activeOnly)
        return false; // might uncomment

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

  if (loading) return <main className="p-8">Loading…</main>;
  if (!isStaff)
    return (
      <main className="p-8">
        <Link href="/login">Login</Link> required.
      </main>
    );
  if (error) return <main className="p-8 text-red-600">{error}</main>;

  // Helper: try multiple backend endpoints to delete a Workspace user
  const tryGsuiteDelete = async (
    email?: string | null,
  ): Promise<{attempted: number; ok: boolean; error?: string}> => {
    if (!email) return {attempted: 0, ok: false, error: 'no email'};

    const paths = [
      '/api/gsuite/delete', // primary
      '/api/gsuite/users/delete', // alt
      '/api/gsuite/deprovision/delete', // alt
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
        alert(
          'End date is required before deleting. Please set the end date and click "Save & Delete".',
        );
        openEdit(r, {forDelete: true});
        return;
      }
      throw new Error(j?.error || `HTTP ${res.status}`);
    }

    // try Workspace delete only if we have an email
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

  /* ===== Delete button behavior ===== */
  const handleDelete = async (r: Row) => {
    if (tab === 'active') {
      // If intern and no end date -> force setting end date first
      if (r.internId && !r.leavingDate) {
        alert(
          'End date is required before deleting. Set the end date, then click "Save & Delete".',
        );
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

    // Inactive tab -> hard delete intern_details (+ related)
    if (tab === 'inactive') {
      if (!r.internId) {
        alert('Missing intern id.');
        return;
      }
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

  /* ===== Edit Modal (updated) ===== */
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
      console.error('Failed to fetch update logs:', err);
      setUpdateLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openEdit = (r: Row, opts?: {forDelete?: boolean}) => {
    setPendingDelete(opts?.forDelete ? r : null);
    setEdit(r);

    // inline name edit
    setEditName(r.name || '');
    setEditingName(false);

    // existing fields
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

    // Prefill Emp Type from backend detail (only when there is a portal user)
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

    // load departments + map current department/position to ids
    (async () => {
      const rows = await loadDepartmentsFull(); // <- use return value
      const dep = rows.find(
        d =>
          (d.departmentName || '').toLowerCase() ===
          (r.department || '').toLowerCase(),
      );
      const depId = dep?.id ?? null;
      setEditDeptId(depId);

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

    // If we are saving specifically to delete, end date must be set
    if (opts?.thenDelete && !editEnd) {
      alert('Please set the End date before deleting.');
      return;
    }

    // department/position rule
    if (editDeptId != null) {
      const dep = depts.find(d => d.id === editDeptId);
      if (!dep) {
        alert('Invalid department');
        return;
      }
      if (editPosId == null || !dep.positions.some(p => p.id === editPosId)) {
        alert('Select a position that belongs to the chosen department');
        return;
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

      // Persist Emp Type on the users table (identified by companyEmail)
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

      // If this save was part of deletion, start delete immediately
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
    } catch {
      // ignore; fallback to row-only data
    }
  };

  /* ===== Table headers (fixed 6 columns) ===== */
  const thLabel = (id: ColId) => ALL_COLS.find(c => c.id === id)?.label || id;

  /* ===== Row cells (fixed 6 columns) ===== */
  const renderCells = (r: Row) => (
    <>
      {/* name */}
      <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-[240px] truncate">
        {r.name}
      </td>
      {/* companyEmail */}
      <td className="px-6 py-4 text-sm text-gray-700 max-w-[260px] truncate">
        {r.companyEmail || '—'}
      </td>
      {/* department */}
      <td className="px-6 py-4 text-sm text-gray-700">{r.department || '—'}</td>
      {/* position */}
      <td className="px-6 py-4 text-sm text-gray-700">{r.position || '—'}</td>
      {/* start */}
      <td className="px-6 py-4 text-sm text-gray-700">{dmy(r.joiningDate)}</td>
      {/* end */}
      <td className="px-6 py-4 text-sm text-gray-700">{dmy(r.leavingDate)}</td>

      {/* Details */}
      <td className="px-6 py-4 text-sm">
        <button
          onClick={() => openDetails(r)}
          className="px-3 py-1 bg-white border border-blue-200 text-blue-600 rounded-md text-sm hover:bg-blue-50 transition-colors"
          title="See full details"
        >
          Details
        </button>
      </td>
      {/* Actions */}
      <td className="px-6 py-4 text-sm">
        <div className="flex gap-2">
          <button
            title="Edit"
            onClick={() => openEdit(r)}
            className={ACTION_BTN_BLUE}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            title="Update History"
            onClick={() => openUpdateLog(r)}
            className={ACTION_BTN_BLUE}
          >
            <ClipboardList className="w-4 h-4" />
          </button>
          {r.userId != null &&
            user?.role === 'super_admin' &&
            (r.blocked ? (
              <button
                title="Restore access"
                onClick={async () => {
                  try {
                    await unblockUser(r.userId!);
                    await loadRows(tab);
                  } catch {
                    alert('Restore failed');
                  }
                }}
                className={ACTION_BTN_GREEN}
              >
                <Unlock className="w-4 h-4" />
              </button>
            ) : (
              <button
                title="Revoke access"
                onClick={async () => {
                  if (!confirm('Revoke portal access and suspend Workspace?'))
                    return;
                  try {
                    await blockUser(r.userId!);
                    await loadRows(tab);
                  } catch {
                    alert('Revoke failed');
                  }
                }}
                className={ACTION_BTN_RED}
              >
                <Lock className="w-4 h-4" />
              </button>
            ))}

          <button
            title="Deactivate & Delete login"
            onClick={() => handleDelete(r)}
            className={ACTION_BTN_RED}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </>
  );

  /* ===== Details modal content builder ===== */
  const buildDetailRows = (r: Row) => {
    // SA sees all fields; HR sees only SA-allowed hrCols (+ the 6 basics)
    const allowed: Set<ColId> = isSA
      ? new Set(ALL_COLS.map(c => c.id))
      : new Set(ALL_COLS.map(c => c.id).filter(id => id !== 'role'));

    const vd = viewDetail || {};
    const valFor = (id: ColId): string => {
      switch (id) {
        case 'name':
          return vd.firstName && vd.surname
            ? `${vd.firstName} ${vd.surname}`
            : r.name || '—';
        case 'companyEmail':
          return vd.companyEmail ?? r.companyEmail ?? '—';
        case 'department':
          return r.department || '—';
        case 'position':
          return r.position || '—';
        case 'gender':
          return (vd.gender ?? r.gender ?? '—').toString();
        case 'nationality':
          return vd.nationality ?? r.nationality ?? '—';
        case 'status':
          return (r.status || '—').toString();
        case 'empID':
          return r.employeeId || '—';
        case 'phone':
          return vd.phone ?? r.phone ?? '—';
        case 'startDate':
          return dmy(vd.startDate ?? r.joiningDate);
        case 'endDate':
          return dmy(vd.endDate ?? r.leavingDate);
        case 'personalEmail':
          return vd.personalEmail ?? r.personalEmail ?? '—';
        case 'birthdate':
          return dmy(vd.birthdate ?? r.dob);
        case 'supervisor':
          return vd.supervisor ?? r.supervisor ?? '—';
        case 'role':
          return roleLabel(r.role);
        case 'empType': {
          const v = (vd.empType ?? r.empType) as string | null | undefined;
          return v ? normalizeEmpType(v) : '—';
        }

        default:
          return '—';
      }
    };

    // Display order follows ALL_COLS
    return ALL_COLS.filter(c => allowed.has(c.id)).map(c => ({
      label: c.label,
      value: valFor(c.id),
    }));
  };

  return (
    <main className="flex-1 p-8 bg-gray-50 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium text-gray-900">User Management</h1>

        <div className="flex items-center gap-4">
          <Link
            href="/admin/import-users"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
            title="Import users from CSV"
          >
            <Upload className="w-4 h-4" /> Import Users
          </Link>

          <Tabs tab={tab} onChange={setTab} />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <input
            placeholder="Search name, email, dept, position, ID…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="input w-full"
          />
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">
              Department
            </label>
            <select
              value={dep}
              onChange={e => setDep(e.target.value)}
              className="input w-full"
            >
              <option value="all">All departments</option>
              {departments.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">
              Gender
            </label>
            <select
              value={gen}
              onChange={e => setGen(e.target.value)}
              className="input w-full"
            >
              {['all', 'male', 'female', 'others'].map(v => (
                <option key={v} value={v}>
                  {v === 'all'
                    ? 'All genders'
                    : v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">
              Country
            </label>
            <CountrySelect
              value={country}
              onChange={setCountry}
              label=""
              allowClear
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            {cfg?.selectable && isHR && (
              <button
                onClick={() => setShowCols(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow-sm transition-all"
                title="Configure which fields HR can see in Details"
              >
                ▦ Columns
              </button>
            )}
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded shadow-sm transition-all hover:bg-red-700"
            >
              ⟲ Reset
            </button>
          </div>
        </div>
      </div>

      {/* Table (fixed 6 columns) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
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
            {filtered.map((r, i) => {
              const key =
                r.userId != null
                  ? `u-${r.userId}`
                  : r.internId != null
                    ? `i-${r.internId}`
                    : `idx-${i}-${r.companyEmail || ''}`;
              return (
                <tr key={key} className="hover:bg-gray-50 transition-colors">
                  {renderCells(r)}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={TABLE_COLS.length + 2}
                  className="px-6 py-4 text-center text-gray-500"
                >
                  No users for this tab / filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Columns Modal (SA) — controls HR Details only */}
      {/* Columns Modal (HR) — controls HR Details only */}
      {isHR && cfg?.selectable && showCols && (
        <div onClick={() => setShowCols(false)} className={MODAL_OVERLAY}>
          <div onClick={e => e.stopPropagation()} className={MODAL_CARD}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Select Columns (HR)
            </h2>
            <div className="overflow-auto max-h-[380px] border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
              {ALL_COLS.map(c => (
                <label
                  key={c.id}
                  className="flex items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={localCols.has(c.id)}
                    onChange={e => {
                      setLocalCols(s => {
                        const n = new Set(s);
                        if (e.target.checked) {
                          n.add(c.id);
                        } else {
                          n.delete(c.id);
                        }
                        return n;
                      });
                    }}
                    className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCols(false)}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCols}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Table always shows 6 basic fields. This controls extra fields in
              the Details modal for HR.
            </p>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {edit && (
        <div onClick={() => setEdit(null)} className={MODAL_OVERLAY}>
          <div onClick={e => e.stopPropagation()} className={MODAL_CARD}>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
              Edit:{' '}
              {editingName ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  className="text-lg font-semibold border-b border-gray-300 dark:border-gray-600 focus:outline-none bg-transparent"
                />
              ) : (
                <span
                  onClick={() => setEditingName(true)}
                  title="Click to edit name"
                  className="cursor-pointer border-b border-dashed border-gray-400 hover:border-blue-500 hover:text-blue-600 transition-colors"
                >
                  {editName || edit.name}
                </span>
              )}
            </h3>

            <div className="space-y-4">
              {/* Department & Position */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label>
                  <div className={LABEL_CLASS}>Department</div>
                  <select
                    value={editDeptId ?? ''}
                    onChange={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setEditDeptId(v);
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
                    onChange={e =>
                      setEditPosId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className={INPUT_CLASS}
                    disabled={editDeptId == null}
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
                </label>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label>
                  <div className={LABEL_CLASS}>Start date</div>
                  <input
                    type="date"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label>
                  <div className={LABEL_CLASS}>End date</div>
                  <input
                    type="date"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label>
                  <div className={LABEL_CLASS}>Phone</div>
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label>
                  <div className={LABEL_CLASS}>Personal email</div>
                  <input
                    type="email"
                    value={editPersonalEmail}
                    onChange={e => setEditPersonalEmail(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              {/* Demographics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <label>
                  <div className={LABEL_CLASS}>Birthdate</div>
                  <input
                    type="date"
                    value={editBirthdate}
                    onChange={e => setEditBirthdate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              {/* Role (SA only) */}
              {isSA && edit?.userId && (
                <label>
                  <div className={LABEL_CLASS}>Role</div>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as any)}
                    className={INPUT_CLASS}
                  >
                    <option value="intern">EMP</option>
                    <option value="hr">hr</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </label>
              )}
              {/* Supervisor */}
              <label className="block">
                <div className={LABEL_CLASS}>Supervisor</div>
                <input
                  value={editSupervisor}
                  onChange={e => setEditSupervisor(e.target.value)}
                  placeholder="e.g. Antonio"
                  className={INPUT_CLASS}
                />
              </label>

              {/* Emp Type */}
              <label className="block">
                <div className={LABEL_CLASS}>Emp Type</div>
                <select
                  value={editEmpType}
                  onChange={e => setEditEmpType(e.target.value as EmpType)}
                  className={INPUT_CLASS}
                  disabled={!edit?.userId}
                >
                  {
                    // HR and SA can set team_lead
                    (user?.role === 'super_admin' || user?.role === 'hr'
                      ? (['intern', 'employee', 'team_lead'] as EmpType[])
                      : (['intern', 'employee'] as EmpType[])
                    ).map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))
                  }
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEdit(null);
                  setPendingDelete(null);
                }}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>

              {pendingDelete && (
                <button
                  onClick={() => saveEdit({thenDelete: true})}
                  disabled={!edit?.internId || !editEnd}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save & Delete
                </button>
              )}

              <button
                onClick={() => saveEdit()}
                disabled={!edit?.internId}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>

            {!edit?.internId && (
              <p className="mt-2 text-sm text-amber-600">
                (This looks like a staff account. Edit for staff isn’t wired
                yet.)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Details Modal */}
      {view && (
        <div onClick={() => setView(null)} className={MODAL_OVERLAY}>
          <div onClick={e => e.stopPropagation()} className={MODAL_CARD}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Details: {view.name}
              </h3>
              <button
                onClick={() => setView(null)}
                className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>

            {/* build rows per role/config */}
            {(() => {
              const items = buildDetailRows(view);
              const vd = viewDetail || {};
              const sos = (vd.sos ?? null) as {
                relation: string | null;
                phone: string | null;
              } | null;

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((it, idx) => (
                      <div key={idx}>
                        <FragmentRow label={it.label} value={it.value} />
                      </div>
                    ))}
                  </div>

                  <hr className="border-gray-100 dark:border-gray-700" />

                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Emergency Contact (SOS)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <FragmentRow
                          label="SOS Phone"
                          value={sos?.phone ?? '—'}
                        />
                      </div>
                      <div>
                        <FragmentRow
                          label="SOS Relation"
                          value={sos?.relation ?? '—'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Update Log Modal */}
      {showUpdateLog && (
        <div className={MODAL_OVERLAY}>
          <div className={`${MODAL_CARD} max-w-4xl`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Update History: {updateLogUser?.name || 'User'}
              </h2>
              <button
                onClick={() => setShowUpdateLog(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {loadingLogs ? (
              <div className="text-center py-10 text-gray-500">Loading...</div>
            ) : updateLogs.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                No update history found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        Date & Time
                      </th>
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        Field
                      </th>
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        Old Value
                      </th>
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        New Value
                      </th>
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        Updated By
                      </th>
                      <th className="p-3 font-semibold text-gray-900 dark:text-gray-100">
                        IP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {updateLogs.map(log => (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="p-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {new Date(log.updatedAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200">
                          {log.fieldName}
                        </td>
                        <td className="p-3 text-red-600 dark:text-red-400 max-w-[200px] break-all">
                          {log.oldValue || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-emerald-600 dark:text-emerald-400 max-w-[200px] break-all">
                          {log.newValue || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {log.updatedByName}
                          </div>
                          {log.updatedByRole && (
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1">
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                {log.updatedByRole}
                              </span>
                              {log.updatedByEmpType && (
                                <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                  {log.updatedByEmpType.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs text-gray-500">
                          {log.ip || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowUpdateLog(false)}
                className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FragmentRow({label, value}: {label: string; value: string}) {
  return (
    <div>
      <div className={LABEL_CLASS}>{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium break-all">
        {value}
      </div>
    </div>
  );
}

function Tabs({tab, onChange}: {tab: Tab; onChange: (t: Tab) => void}) {
  const Btn = ({id, label}: {id: Tab; label: string}) => {
    const active = tab === id;
    return (
      <button
        onClick={() => onChange(id)}
        className={`px-4 py-2 border text-sm font-medium transition-colors ${
          active
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        } ${id === 'active' ? 'rounded-l-lg border-r-0' : 'rounded-r-lg'}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex">
      <Btn id="active" label="Active Users" />
      <Btn id="inactive" label="Inactive Users" />
    </div>
  );
}
