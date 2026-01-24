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

  if (loading)
    return (
      <main className="p-6">
        <div className="text-gray-500">Loading…</div>
      </main>
    );
  if (!isStaff)
    return (
      <main className="p-6">
        <Link href="/login" className="text-blue-600 hover:underline">
          Login
        </Link>{' '}
        required.
      </main>
    );
  if (error)
    return (
      <main className="p-6 text-red-600">
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
          {error}
        </div>
      </main>
    );

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
        <th
          key={id}
          className="text-left bg-gray-50 p-3 font-semibold text-gray-700 whitespace-nowrap"
        >
          {thLabel(id)}
        </th>
      ))}
      <th className="text-left bg-gray-50 p-3 font-semibold text-gray-700 whitespace-nowrap">
        Details
      </th>
      <th className="text-left bg-gray-50 p-3 font-semibold text-gray-700 whitespace-nowrap">
        Actions
      </th>
    </>
  );

  /* ===== Row cells (fixed 6 columns) ===== */
  const renderCells = (r: Row) => (
    <>
      {/* name */}
      <td className="p-3 border-b border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]">
        {r.name}
      </td>
      {/* companyEmail */}
      <td className="p-3 border-b border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[260px]">
        {r.companyEmail || '—'}
      </td>
      {/* department */}
      <td className="p-3 border-b border-gray-100">{r.department || '—'}</td>
      {/* position */}
      <td className="p-3 border-b border-gray-100">{r.position || '—'}</td>
      {/* start */}
      <td className="p-3 border-b border-gray-100">{dmy(r.joiningDate)}</td>
      {/* end */}
      <td className="p-3 border-b border-gray-100">{dmy(r.leavingDate)}</td>

      {/* Details */}
      <td className="p-3 border-b border-gray-100">
        <button
          onClick={() => openDetails(r)}
          className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100 text-sm font-medium transition-colors"
          title="See full details"
        >
          Details
        </button>
      </td>
      {/* Actions */}
      <td className="p-3 border-b border-gray-100">
        <div className="flex gap-2.5">
          <button
            title="Edit"
            onClick={() => openEdit(r)}
            className="text-lg bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-100"
          >
            ✏️
          </button>
          <button
            title="Update History"
            onClick={() => openUpdateLog(r)}
            className="text-lg bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-100"
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
                className="text-lg bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-100"
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
                className="text-lg bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-100"
              >
                🔒
              </button>
            ))}

          <button
            title="Deactivate & Delete login"
            onClick={() => handleDelete(r)}
            className="text-lg bg-transparent border-none cursor-pointer p-1 rounded hover:bg-red-50 hover:text-red-600"
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
    <main className="max-w-[1250px] mx-auto my-8 p-4">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <h1 className="mr-auto text-2xl font-bold text-gray-900">
          User Management
        </h1>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/import-users"
            className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 inline-flex items-center gap-2 no-underline hover:bg-gray-50 transition-colors font-medium text-sm"
            title="Import users from CSV"
          >
            ⬆️ Import Users
          </Link>

          <Tabs tab={tab} onChange={setTab} />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3">
          <input
            placeholder="Search name, email, dept, position, ID…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="p-2.5 border border-gray-300 rounded-lg w-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Department
            </label>
            <select
              value={dep}
              onChange={e => setDep(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
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
            <label className="block text-xs text-gray-500 mb-1">Gender</label>
            <select
              value={gen}
              onChange={e => setGen(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
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
            <label className="block text-xs text-gray-500 mb-1">Country</label>
            <div className="w-full">
              <CountrySelect
                value={country}
                onChange={setCountry}
                label=""
                allowClear
              />
            </div>
          </div>
          <div className="flex gap-3 items-end justify-end">
            {cfg?.selectable && isHR && (
              <button
                onClick={() => setShowCols(true)}
                className="bg-sky-500 text-white border-none px-4 py-2.5 rounded-lg cursor-pointer hover:bg-sky-600 transition-colors font-medium text-sm whitespace-nowrap"
                title="Configure which fields HR can see in Details"
              >
                ▦ Select Columns
              </button>
            )}
            <button
              onClick={resetFilters}
              className="bg-red-500 text-white border-none px-4 py-2.5 rounded-lg cursor-pointer hover:bg-red-600 transition-colors font-medium text-sm whitespace-nowrap"
            >
              ⟲ Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table (fixed 6 columns) */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm text-gray-800">
          <thead>
            <tr>{renderThs()}</tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const key =
                r.userId != null
                  ? `u-${r.userId}`
                  : r.internId != null
                    ? `i-${r.internId}`
                    : `idx-${i}-${r.companyEmail || ''}`;
              return (
                <tr
                  key={key}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {renderCells(r)}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={TABLE_COLS.length + 2}
                  className="p-8 text-center text-gray-500 italic"
                >
                  No users for this tab / filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Columns Modal (HR) — controls HR Details only */}
      {isHR && cfg?.selectable && showCols && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4">
          <div
            onClick={e => e.stopPropagation()}
            className="w-[520px] max-w-[95vw] max-h-[80vh] overflow-hidden bg-white rounded-xl p-6 shadow-2xl flex flex-col"
          >
            <h2 className="m-0 mb-4 text-xl font-bold text-gray-800">
              Select Columns (HR)
            </h2>
            <div className="overflow-y-auto border border-gray-200 rounded-lg p-3 max-h-[380px]">
              {ALL_COLS.map(c => (
                <label
                  key={c.id}
                  className="block p-2 hover:bg-gray-50 rounded cursor-pointer flex items-center gap-2"
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
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCols(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCols}
                className="px-4 py-2 border-none rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
            <p className="mt-3 text-gray-500 text-xs">
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
          className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-[520px] max-w-[95vw] bg-white rounded-xl p-6 shadow-2xl"
          >
            <h3 className="mt-0 mb-4 text-xl font-bold text-gray-800 flex items-center gap-2">
              Edit:
              {editingName ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  className="text-lg font-semibold border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <span
                  onClick={() => setEditingName(true)}
                  title="Click to edit name"
                  className="cursor-text border-b border-dashed border-gray-400 hover:border-blue-500"
                >
                  {editName || edit.name}
                </span>
              )}
            </h3>

            <div className="grid gap-4">
              {/* Department & Position */}
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Department</div>
                  <select
                    value={editDeptId ?? ''}
                    onChange={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setEditDeptId(v);
                      setEditPosId(null);
                    }}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">—</option>
                    {depts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.departmentName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Position</div>
                  <select
                    value={editPosId ?? ''}
                    onChange={e =>
                      setEditPosId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
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
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Start date</div>
                  <input
                    type="date"
                    value={editStart}
                    onChange={e => setEditStart(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">End date</div>
                  <input
                    type="date"
                    value={editEnd}
                    onChange={e => setEditEnd(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Phone</div>
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">
                    Personal email
                  </div>
                  <input
                    type="email"
                    value={editPersonalEmail}
                    onChange={e => setEditPersonalEmail(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {/* Demographics */}
              <div className="grid grid-cols-3 gap-4">
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Country</div>
                  <input
                    value={editNationality}
                    onChange={e => setEditNationality(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Gender</div>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="others">Others</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Birthdate</div>
                  <input
                    type="date"
                    value={editBirthdate}
                    onChange={e => setEditBirthdate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {/* Role (SA only) */}
              {isSA && edit?.userId && (
                <label className="block">
                  <div className="text-xs text-gray-500 mb-1">Role</div>
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as any)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="intern">EMP</option>
                    <option value="hr">hr</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </label>
              )}
              {/* Supervisor */}
              <label className="block">
                <div className="text-xs text-gray-500 mb-1">Supervisor</div>
                <input
                  value={editSupervisor}
                  onChange={e => setEditSupervisor(e.target.value)}
                  placeholder="e.g. Antonio"
                  className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                />
              </label>

              {/* Emp Type */}
              <label className="block">
                <div className="text-xs text-gray-500 mb-1">Emp Type</div>
                <select
                  value={editEmpType}
                  onChange={e => setEditEmpType(e.target.value as EmpType)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
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
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>

              {pendingDelete && (
                <button
                  onClick={() => saveEdit({thenDelete: true})}
                  disabled={!edit?.internId || !editEnd}
                  className="px-4 py-2 border-none rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save & Delete
                </button>
              )}

              <button
                onClick={() => saveEdit()}
                disabled={!edit?.internId}
                className="px-4 py-2 border-none rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>

            {!edit?.internId && (
              <p className="mt-3 text-amber-700 text-sm">
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
          className="fixed inset-0 bg-black/35 grid place-items-center z-[1100] p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-[640px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-white rounded-xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="m-0 text-xl font-bold text-gray-800">
                Details: {view.name}
              </h3>
              <button
                onClick={() => setView(null)}
                className="border border-gray-300 bg-white rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 text-gray-700 font-medium"
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
                  <div className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-3">
                    {items.map((it, idx) => (
                      <FragmentRow
                        key={idx}
                        label={it.label}
                        value={it.value}
                      />
                    ))}
                  </div>

                  <hr className="my-4 border-0 border-t border-gray-200" />

                  <h4 className="m-0 mb-3 text-lg font-semibold text-gray-800">
                    Emergency Contact (SOS)
                  </h4>
                  <div className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-3">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl w-[90%] max-w-[900px] max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="m-0 text-xl font-bold text-gray-900">
                Update History: {updateLogUser?.name || 'User'}
              </h2>
              <button
                onClick={() => setShowUpdateLog(false)}
                className="bg-transparent border-none text-2xl cursor-pointer text-gray-500 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            {loadingLogs ? (
              <div className="text-center p-10 text-gray-500">Loading...</div>
            ) : updateLogs.length === 0 ? (
              <div className="text-center p-10 text-gray-500">
                No update history found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-left">
                      <th className="p-3 font-semibold text-gray-700">
                        Date & Time
                      </th>
                      <th className="p-3 font-semibold text-gray-700">Field</th>
                      <th className="p-3 font-semibold text-gray-700">
                        Old Value
                      </th>
                      <th className="p-3 font-semibold text-gray-700">
                        New Value
                      </th>
                      <th className="p-3 font-semibold text-gray-700">
                        Updated By
                      </th>
                      <th className="p-3 font-semibold text-gray-700">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {updateLogs.map(log => (
                      <tr
                        key={log.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="p-3 text-gray-600 whitespace-nowrap text-xs">
                          {new Date(log.updatedAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-gray-800">
                          {log.fieldName}
                        </td>
                        <td className="p-3 text-red-600 break-words max-w-[200px]">
                          {log.oldValue || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-emerald-600 break-words max-w-[200px]">
                          {log.newValue || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-800">
                            {log.updatedByName}
                          </div>
                          {log.updatedByRole && (
                            <div className="text-xs text-gray-500 mt-0.5 flex gap-1">
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded">
                                {log.updatedByRole}
                              </span>
                              {log.updatedByEmpType && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
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
                className="px-5 py-2.5 bg-blue-500 text-white border-none rounded-lg cursor-pointer font-medium hover:bg-blue-600 transition-colors"
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
      <strong className="text-gray-700 font-semibold">{label}</strong>
      <div className="break-words">{value}</div>
    </>
  );
}

function Tabs({tab, onChange}: {tab: Tab; onChange: (t: Tab) => void}) {
  const Btn = ({id, label}: {id: Tab; label: string}) => (
    <button
      onClick={() => onChange(id)}
      className={`px-4 py-2.5 border border-gray-300 font-medium transition-colors cursor-pointer text-sm ${
        tab === id
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white text-gray-900 hover:bg-gray-50'
      } ${id === 'active' ? 'rounded-l-lg border-r-0' : 'rounded-r-lg'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex">
      <Btn id="active" label="Active Users" />
      <Btn id="inactive" label="Inactive Users" />
    </div>
  );
}
