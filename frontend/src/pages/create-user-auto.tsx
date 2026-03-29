// frontend/src/pages/create-user-auto.tsx
import {useEffect, useMemo, useState} from 'react';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {CheckCircle, AlertCircle, RefreshCw} from 'lucide-react';

const CountrySelect = dynamic(() => import('@/components/CountrySelect'), {
  ssr: false,
});
const DOMAIN = process.env.NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN || 'extramus.eu';

type Dept = {
  id: number;
  departmentName: string;
  positions: {id: number; name: string}[];
};

type EmpType = 'intern' | 'employee' | 'team_lead';

function clean(str: string) {
  return (str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

function previewEmail(first: string, sur: string, deptName?: string) {
  const f = clean(first);
  const s0 = clean(sur)[0] || '';
  const d2 = deptName ? clean(deptName).slice(0, 2) : '';
  if (!f || !s0 || !d2) return `—@${DOMAIN}`;
  const rand = Math.floor(10000 + Math.random() * 90000).toString();
  return `${f}.${s0}${d2}${rand}@${DOMAIN}`;
}

type CreateAutoResult = {
  companyEmail?: string;
  empID?: string;
  tempPasswords?: {google?: string; site?: string};

  // status flags
  ok?: boolean; // portal user creation
  google?: {
    created?: boolean;
    error?: string | null;
  };
  email?: {
    sent?: boolean;
  };
};

type ProvisionResp = {
  ok?: boolean;
  companyEmail?: string;
  empID?: string;
  empId?: string;
  tempPasswords?: {google?: string; site?: string};

  google?: {
    created?: boolean;
    error?: string | null;
  };
  email?: {sent?: boolean};

  error?: string;
};

export default function CreateUserAuto() {
  const {user} = useAuth();

  const isLoggedIn = !!user;
  const isAllowed =
    !!user && (user.role === 'hr' || user.role === 'super_admin');

  // form state
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [nationality, setNationality] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [birthdate, setBirthdate] = useState<string>('');
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | ''>('');
  const [selectedPosId, setSelectedPosId] = useState<number | ''>('');
  const [joiningDate, setJoiningDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [supervisor, setSupervisor] = useState('Antonio');

  const [loadingDepts, setLoadingDepts] = useState(true);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateAutoResult | null>(null);
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error';
    msg: string;
  } | null>(null);

  const [empType, setEmpType] = useState<EmpType>('intern');

  if (!isLoggedIn)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        <Link href="/login" className="text-blue-600 hover:underline mr-1">
          Login
        </Link>
        required.
      </div>
    );
  if (!isAllowed)
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        Forbidden.
      </div>
    );

  useEffect(() => {
    if (!isAllowed) return;
    let dead = false;
    (async () => {
      setLoadingDepts(true);
      try {
        const getJson = async (url: string) => {
          const res = await fetchWithAuth(url);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json();
        };

        let raw: any[] = [];
        try {
          raw = await getJson('/api/departments/full');
        } catch {
          raw = await getJson('/api/departments');
        }

        if (dead) return;

        const norm: Dept[] = Array.isArray(raw)
          ? raw
              .map((d: any) => ({
                id: Number(d.id),
                departmentName:
                  d.departmentName ?? d.name ?? d.department_name ?? '',
                positions: Array.isArray(d.positions)
                  ? d.positions.map((p: any) => ({
                      id: Number(p.id),
                      name: p.name ?? p.positionName ?? '',
                    }))
                  : [],
              }))
              .filter(x => Number.isFinite(x.id) && x.departmentName)
          : [];

        setDepartments(norm);
        setDeptError(null);
      } catch (e: any) {
        setDepartments([]);
        setDeptError(e?.message || 'Failed to load departments');
      } finally {
        if (!dead) setLoadingDepts(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [isAllowed]);

  const positionsForDept = useMemo(() => {
    const d = departments.find(x => x.id === Number(selectedDeptId));
    return d?.positions || [];
  }, [departments, selectedDeptId]);

  const deptName = departments.find(
    x => x.id === Number(selectedDeptId),
  )?.departmentName;

  const finalEmail = result?.companyEmail
    ? result.companyEmail
    : previewEmail(firstName, surname, deptName);

  const onDeptChange = (val: string) => {
    if (!val) {
      setSelectedDeptId('');
      setSelectedPosId('');
      return;
    }
    setSelectedDeptId(Number(val));
    setSelectedPosId('');
  };

  async function postJSON(path: string, payload: any): Promise<ProvisionResp> {
    const res = await fetchWithAuth(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        // ignore
      }
      const err = new Error(msg) as any;
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function postProvisionWithFallback(payload: any) {
    const paths = [
      '/api/gsuite/provision/auto',
      '/api/admin/provision/auto',
      '/api/provision/auto',
      '/api/users/create-auto',
    ];

    let lastErr: any = null;
    for (const p of paths) {
      try {
        return await postJSON(p, payload);
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (
          msg.includes('Cannot GET') ||
          msg.includes('Cannot POST') ||
          msg.includes('Not Found') ||
          msg.includes('404')
        ) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('Provision endpoint not found');
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    setResult(null);
    setNotice(null);

    try {
      const payload = {
        firstName,
        surname,
        personalEmail,
        nationality: nationality || null,
        gender: gender || null,
        birthdate: birthdate || null,
        phone: phone || null,
        departmentId: Number(selectedDeptId),
        positionId: Number(selectedPosId),
        joiningDate,
        endDate: endDate || null,
        supervisor: supervisor || null,
        empType,
      };

      const data: ProvisionResp = await postProvisionWithFallback(payload);

      const mapped: CreateAutoResult = {
        companyEmail: data.companyEmail,
        empID: data.empID ?? data.empId ?? undefined,
        tempPasswords: data.tempPasswords ?? {},
        ok: data.ok ?? true,
        google: data.google
          ? {
              created: data.google.created,
              error: data.google.error ?? null,
            }
          : undefined,
        email: data.email
          ? {
              sent: data.email.sent,
            }
          : undefined,
      };

      setResult(mapped);

      if (data?.ok) {
        const summaryParts: string[] = [];
        summaryParts.push('Portal user created.');

        const googleCreated = data.google?.created;
        if (googleCreated === true) {
          summaryParts.push('Google Workspace account created.');
        } else if (googleCreated === false) {
          summaryParts.push('Google Workspace account not created yet.');
        }

        const emailSent = data.email?.sent;
        if (emailSent === true) {
          summaryParts.push(`Onboarding email sent to ${personalEmail}.`);
        } else if (emailSent === false) {
          summaryParts.push('Onboarding email not sent.');
        }

        const hasError = googleCreated === false || emailSent === false;

        setNotice({
          kind: hasError ? 'error' : 'success',
          msg: summaryParts.join(' '),
        });
      } else {
        setNotice({kind: 'error', msg: data?.error || 'Provisioning failed.'});
      }
    } catch (e: any) {
      const m = String(e?.message || 'Provision failed');
      setErr(m);
      setNotice({kind: 'error', msg: m});
      if (e?.status === 409) {
        document
          .querySelector<HTMLInputElement>('input[type="email"]')
          ?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const retryGoogle = async () => {
    if (!result?.companyEmail) {
      setNotice({
        kind: 'error',
        msg: 'Missing company email; cannot retry Google provisioning.',
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const res = await fetchWithAuth('/api/gsuite/provision/retry/google', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          companyEmail: result.companyEmail,
          firstName,
          surname,
          personalEmail,
        }),
      });

      if (!res.ok) {
        const msg = `${res.status} ${res.statusText}`;
        setNotice({
          kind: 'error',
          msg: `Google retry failed: ${msg}`,
        });
        return;
      }

      const data: ProvisionResp = await res.json();

      setResult(prev => ({
        ...(prev || {}),
        companyEmail: data.companyEmail ?? prev?.companyEmail,
        tempPasswords: {
          ...(prev?.tempPasswords || {}),
          ...(data.tempPasswords || {}),
        },
        google: data.google ?? prev?.google,
        email: data.email ?? prev?.email,
      }));

      if (data.ok) {
        setNotice({
          kind: 'success',
          msg: 'Google Workspace account retry succeeded.',
        });
      } else {
        setNotice({
          kind: 'error',
          msg: data.error || 'Google Workspace account retry failed.',
        });
      }
    } catch (e: any) {
      const msg = String(e?.message || 'Google retry failed');
      setNotice({kind: 'error', msg});
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    firstName &&
    surname &&
    personalEmail &&
    selectedDeptId &&
    selectedPosId &&
    joiningDate &&
    gender &&
    nationality;

  return (
    <div className="max-w-4xl mx-auto p-6 my-8 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
          Create User (Auto-provision)
        </h1>
        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-sm">
          Email preview: <strong className="font-mono">{finalEmail}</strong>
          <div className="text-xs mt-1 opacity-80">
            Final email and EMP ID are generated on submit to ensure uniqueness.
          </div>
        </div>
      </header>

      <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        {notice && (
          <div
            className={`p-4 border-b flex items-start gap-3 ${
              notice.kind === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 text-green-800 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {notice.kind === 'success' ? (
              <CheckCircle size={20} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
            )}
            <div className="text-sm font-medium">{notice.msg}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="p-8 space-y-8">
          {/* Section: Personal Info */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 pb-3 mb-6">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Surname <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  value={surname}
                  onChange={e => setSurname(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Personal Email <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  type="email"
                  value={personalEmail}
                  onChange={e => setPersonalEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Nationality <span className="text-red-500">*</span>
                </label>
                <CountrySelect
                  label=""
                  value={nationality}
                  onChange={setNationality}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                >
                  <option value="">-- Select Gender --</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="others">Others</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Phone (optional)
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Birthdate (optional)
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  type="date"
                  value={birthdate}
                  onChange={e => setBirthdate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Employment Details */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 pb-3 mb-6">
              Employment Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  value={selectedDeptId}
                  onChange={e => onDeptChange(e.target.value)}
                >
                  <option value="">
                    {loadingDepts
                      ? 'Loading…'
                      : deptError
                        ? 'Failed to load'
                        : '-- Select Department --'}
                  </option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.departmentName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Position <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
                  required
                  value={selectedPosId}
                  onChange={e =>
                    setSelectedPosId(
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  disabled={!selectedDeptId || positionsForDept.length === 0}
                >
                  <option value="">
                    {!selectedDeptId
                      ? 'Select a department first'
                      : positionsForDept.length
                        ? '-- Select Position --'
                        : 'No positions'}
                  </option>
                  {positionsForDept.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  type="date"
                  value={joiningDate}
                  onChange={e => setJoiningDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  End Date (optional)
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Employee Type <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  required
                  value={empType}
                  onChange={e => setEmpType(e.target.value as EmpType)}
                >
                  <option value="intern">Intern</option>
                  <option value="employee">Employee</option>
                  <option value="team_lead">Team Lead</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Supervisor (optional)
                </label>
                <input
                  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={supervisor}
                  onChange={e => setSupervisor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Creating...' : 'Create Google Account + Site User'}
            </button>
          </div>
        </form>

        {err && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-800 text-red-600 dark:text-red-300 text-sm text-center">
            {err}
          </div>
        )}

        {result && (
          <div className="bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800 p-8 space-y-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Account Provisioning Result
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Portal user status */}
              <div className="p-4 bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Portal User
                </div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {result.ok === false ? 'Not created' : 'Created'}
                </div>
              </div>

              {/* Google Workspace status */}
              <div className="p-4 bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Google Workspace
                </div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {result.google
                    ? result.google.created
                      ? 'Created'
                      : 'Not created'
                    : 'Not available'}
                </div>
                {result.google?.created === false && (
                  <button
                    onClick={retryGoogle}
                    disabled={submitting}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Retry Google Creation
                  </button>
                )}
              </div>

              {/* Email status */}
              <div className="p-4 bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Onboarding Email
                </div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {result.email
                    ? result.email.sent
                      ? 'Sent'
                      : 'Not sent'
                    : 'Not available'}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              <div className="p-4 flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Company Email
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                  {result.companyEmail ?? '—'}
                </span>
              </div>
              <div className="p-4 flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Employee ID
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                  {result.empID ?? '—'}
                </span>
              </div>
              {result.tempPasswords && (
                <>
                  <div className="p-4 flex justify-between bg-yellow-50 dark:bg-yellow-900/10">
                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-500">
                      Google Temp Password
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                      {result.tempPasswords.google ?? '—'}
                    </span>
                  </div>
                  <div className="p-4 flex justify-between bg-yellow-50 dark:bg-yellow-900/10">
                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-500">
                      Site Temp Password
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                      {result.tempPasswords.site ?? '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
