// frontend/src/pages/admin/users.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/AuthContext';
import {fetchWithAuth} from '@/lib/api';
import CountrySelect from '@/components/CountrySelect';
import {blockUser, unblockUser} from '@/lib/api';

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
  const renderThs = () => (
    <>
      {TABLE_COLS.map(id => (
        <th key={id}>{thLabel(id)}</th>
      ))}
      <th>Details</th>
      <th>Actions</th>
    </>
  );

  /* ===== Row cells (fixed 6 columns) ===== */
  const renderCells = (r: Row) => (
    <>
      {/* name */}
      <td className="px-6 py-4 text-sm font-medium text-gray-900" style={{maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
        {r.name}
      </td>
      {/* companyEmail */}
      <td className="px-6 py-4 text-sm text-gray-700" style={{maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
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
        <div className="flex gap-3">
          <button
            title="Edit"
            onClick={() => openEdit(r)}
            className="text-gray-500 hover:text-blue-600 transition-colors"
          >
            ✏️
          </button>
          <button
            title="Update History"
            onClick={() => openUpdateLog(r)}
            className="text-gray-500 hover:text-blue-600 transition-colors"
          >
            📋
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
                className="text-gray-500 hover:text-green-600 transition-colors"
              >
                🔓
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
                className="text-gray-500 hover:text-red-600 transition-colors"
              >
                🔒
              </button>
            ))}

          <button
            title="Deactivate & Delete login"
            onClick={() => handleDelete(r)}
            className="text-gray-500 hover:text-red-600 transition-colors"
          >
            🗑️
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
            ⬆️ Import Users
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
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">Department</label>
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
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">Gender</label>
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
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">Country</label>
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
                <th key={id} className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {thLabel(id)}
                </th>
              ))}
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
        <div
          onClick={() => setShowCols(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.3)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: '95vw',
              maxHeight: '80vh',
              overflow: 'hidden',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h2 style={{margin: '0 0 12px'}}>Select Columns (HR)</h2>
            <div
              style={{
                overflow: 'auto',
                maxHeight: 380,
                border: '1px solid #eee',
                borderRadius: 8,
                padding: 12,
              }}
            >
              {ALL_COLS.map(c => (
                <label
                  key={c.id}
                  style={{display: 'block', padding: '8px 6px'}}
                >
                  <input
                    type="checkbox"
                    checked={localCols.has(c.id)}
                    onChange={e => {
                      setLocalCols(s => {
                        const n = new Set(s);
                        e.target.checked ? n.add(c.id) : n.delete(c.id);
                        return n;
                      });
                    }}
                    style={{marginRight: 8}}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 12,
              }}
            >
              <button
                onClick={() => setShowCols(false)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveCols}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#1e90ff',
                  color: '#fff',
                }}
              >
                Save
              </button>
            </div>
            <p style={{marginTop: 10, color: '#6b7280', fontSize: 12}}>
              Table always shows 6 basic fields. This controls extra fields in
              the Details modal for HR.
            </p>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {edit && (
        <div
          onClick={() => setEdit(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.3)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: '95vw',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{marginTop: 0}}>
              Edit:{' '}
              {editingName ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: '4px 8px',
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditingName(true)}
                  title="Click to edit name"
                  style={{cursor: 'text', borderBottom: '1px dashed #bbb'}}
                >
                  {editName || edit.name}
                </span>
              )}
            </h3>

            <div style={{display: 'grid', gap: 12}}>
              {/* Department & Position */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Department</div>
                  <select
                    value={editDeptId ?? ''}
                    onChange={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setEditDeptId(v);
                      setEditPosId(null);
                    }}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
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
                  <div style={{fontSize: 13, color: '#6b7280'}}>Position</div>
                  <select
                    value={editPosId ?? ''}
                    onChange={e =>
                      setEditPosId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Start date</div>
                  <input
                    type="date"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>End date</div>
                  <input
                    type="date"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
              </div>

              {/* Contact */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Phone</div>
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>
                    Personal email
                  </div>
                  <input
                    type="email"
                    value={editPersonalEmail}
                    onChange={e => setEditPersonalEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
              </div>

              {/* Demographics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 12,
                }}
              >
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Country</div>
                  <input
                    value={editNationality}
                    onChange={e => setEditNationality(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Gender</div>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="others">Others</option>
                  </select>
                </label>
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Birthdate</div>
                  <input
                    type="date"
                    value={editBirthdate}
                    onChange={e => setEditBirthdate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  />
                </label>
              </div>

              {/* Role (SA only) */}
              {isSA && edit?.userId && (
                <label>
                  <div style={{fontSize: 13, color: '#6b7280'}}>Role</div>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                    }}
                  >
                    <option value="intern">EMP</option>
                    <option value="hr">hr</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </label>
              )}
              {/* Supervisor */}
              <label style={{display: 'block', marginTop: 12}}>
                <div className="text-sm text-gray-600 mb-1">Supervisor</div>
                <input
                  value={editSupervisor}
                  onChange={e => setEditSupervisor(e.target.value)}
                  placeholder="e.g. Antonio"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                  }}
                />
              </label>

              {/* Emp Type */}
              <label style={{display: 'block', marginTop: 12}}>
                <div className="text-sm text-gray-600 mb-1">Emp Type</div>
                <select
                  value={editEmpType}
                  onChange={e => setEditEmpType(e.target.value as EmpType)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                  }}
                  disabled={!edit?.userId}
                >
                  {// HR and SA can set team_lead
                  (user?.role === 'super_admin' || user?.role === 'hr'
                    ? (['intern', 'employee', 'team_lead'] as EmpType[])
                    : (['intern', 'employee'] as EmpType[])
                  ).map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => {
                  setEdit(null);
                  setPendingDelete(null);
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                Cancel
              </button>

              {pendingDelete && (
                <button
                  onClick={() => saveEdit({thenDelete: true})}
                  disabled={!edit?.internId || !editEnd}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 8,
                    background: '#ef4444',
                    color: '#fff',
                  }}
                >
                  Save & Delete
                </button>
              )}

              <button
                onClick={() => saveEdit()}
                disabled={!edit?.internId}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#10b981',
                  color: '#fff',
                }}
              >
                Save
              </button>
            </div>

            {!edit?.internId && (
              <p style={{marginTop: 8, color: '#b45309'}}>
                (This looks like a staff account. Edit for staff isn’t wired
                yet.)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Details Modal */}
      {view && (
        <div
          onClick={() => setView(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 640,
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 12,
              padding: 18,
              boxShadow: '0 10px 30px rgba(0,0,0,.15)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <h3 style={{margin: 0}}>Details: {view.name}</h3>
              <button
                onClick={() => setView(null)}
                style={{
                  border: '1px solid #ddd',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
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
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr',
                      gap: '10px 16px',
                    }}
                  >
                    {items.map((it, idx) => (
                      <FragmentRow
                        key={idx}
                        label={it.label}
                        value={it.value}
                      />
                    ))}
                  </div>

                  <hr
                    style={{
                      margin: '16px 0',
                      border: 0,
                      borderTop: '1px solid #eee',
                    }}
                  />

                  <h4 style={{margin: '0 0 8px'}}>Emergency Contact (SOS)</h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr',
                      gap: '10px 16px',
                    }}
                  >
                    <FragmentRow label="SOS Phone" value={sos?.phone ?? '—'} />
                    <FragmentRow
                      label="SOS Relation"
                      value={sos?.relation ?? '—'}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Update Log Modal */}
      {showUpdateLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              width: '90%',
              maxWidth: 900,
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2 style={{margin: 0, fontSize: 20, fontWeight: 600}}>
                Update History: {updateLogUser?.name || 'User'}
              </h2>
              <button
                onClick={() => setShowUpdateLog(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {loadingLogs ? (
              <div style={{textAlign: 'center', padding: 40}}>Loading...</div>
            ) : updateLogs.length === 0 ? (
              <div style={{textAlign: 'center', padding: 40, color: '#6b7280'}}>
                No update history found
              </div>
            ) : (
              <div style={{overflowX: 'auto'}}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: '2px solid #e5e7eb',
                        textAlign: 'left',
                      }}
                    >
                      <th style={{padding: 12, fontWeight: 600}}>
                        Date & Time
                      </th>
                      <th style={{padding: 12, fontWeight: 600}}>Field</th>
                      <th style={{padding: 12, fontWeight: 600}}>Old Value</th>
                      <th style={{padding: 12, fontWeight: 600}}>New Value</th>
                      <th style={{padding: 12, fontWeight: 600}}>Updated By</th>
                      <th style={{padding: 12, fontWeight: 600}}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {updateLogs.map(log => (
                      <tr
                        key={log.id}
                        style={{borderBottom: '1px solid #f3f4f6'}}
                      >
                        <td
                          style={{
                            padding: 12,
                            color: '#4b5563',
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {new Date(log.updatedAt).toLocaleString()}
                        </td>
                        <td style={{padding: 12}}>
                          <span style={{fontWeight: 600, color: '#1f2937'}}>
                            {log.fieldName}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: 12,
                            color: '#dc2626',
                            maxWidth: 200,
                            wordBreak: 'break-word',
                          }}
                        >
                          {log.oldValue || (
                            <span style={{color: '#9ca3af'}}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: 12,
                            color: '#059669',
                            maxWidth: 200,
                            wordBreak: 'break-word',
                          }}
                        >
                          {log.newValue || (
                            <span style={{color: '#9ca3af'}}>—</span>
                          )}
                        </td>
                        <td style={{padding: 12}}>
                          <div style={{fontWeight: 500, color: '#1f2937'}}>
                            {log.updatedByName}
                          </div>
                          {log.updatedByRole && (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#6b7280',
                                marginTop: 2,
                              }}
                            >
                              <span
                                style={{
                                  padding: '2px 6px',
                                  background: '#e5e7eb',
                                  borderRadius: 4,
                                  marginRight: 4,
                                }}
                              >
                                {log.updatedByRole}
                              </span>
                              {log.updatedByEmpType && (
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    background: '#dbeafe',
                                    borderRadius: 4,
                                  }}
                                >
                                  {log.updatedByEmpType.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: 12,
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: '#6b7280',
                          }}
                        >
                          {log.ip || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setShowUpdateLog(false)}
                style={{
                  padding: '10px 20px',
                  background: '#2d8cf0',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
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
    <>
      <strong>{label}</strong>
      <div style={{overflowWrap: 'anywhere'}}>{value}</div>
    </>
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
