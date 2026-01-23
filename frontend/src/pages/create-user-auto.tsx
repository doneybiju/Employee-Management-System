// frontend/src/pages/create-user-auto.tsx
import {useEffect, useMemo, useState} from 'react';

import s from './create-user-auto.module.css';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import Link from 'next/link';
import dynamic from 'next/dynamic';

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
  return `${f}.${s0}${d2}xxxxx@${DOMAIN}`; // placeholder 5 digits
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
  empID?: string; // some endpoints use empID
  empId?: string; // some use empId
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
      <div>
        <Link href="/login">Login</Link> required.
      </div>
    );
  if (!isAllowed) return <div>Forbidden.</div>;

  useEffect(() => {
    if (!isAllowed) return;
    let dead = false;
    (async () => {
      setLoadingDepts(true);
      try {
        // helper to fetch+json
        const getJson = async (url: string) => {
          const res = await fetchWithAuth(url);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json();
        };

        // try full first, then fallback
        let raw: any[] = [];
        try {
          raw = await getJson('/api/departments/full');
        } catch {
          raw = await getJson('/api/departments');
        }

        if (dead) return;

        // normalize to Dept[]
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

  // ---- helpers ----
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
      } catch {}
      const err = new Error(msg) as any;
      err.status = res.status; // so callers can check e.status === 409
      throw err;
    }
    return res.json();
  }

  // Try several historical endpoints; first one that works wins.
  // Try primary endpoint; only fall back if it's truly missing (404/Not Found).
  async function postProvisionWithFallback(payload: any) {
    const paths = [
      '/api/gsuite/provision/auto', // put this first
      '/api/admin/provision/auto',
      '/api/provision/auto',
      '/api/users/create-auto',
    ];

    let lastErr: any = null;
    for (const p of paths) {
      try {
        return await postJSON(p, payload); // returns ProvisionResp
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

  // ---- end helpers ----

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
        joiningDate, // keep as-is, or joiningDate || null if you prefer
        endDate: endDate || null, // optional
        supervisor: supervisor || null,
        empType,
      };

      const data: ProvisionResp = await postProvisionWithFallback(payload);

      // Map backend response into our UI result object, including statuses
      const mapped: CreateAutoResult = {
        companyEmail: data.companyEmail,
        empID: data.empID ?? data.empId ?? undefined,
        tempPasswords: data.tempPasswords ?? {},
        ok: data.ok ?? true, // if backend omits ok but returned 200, assume success
        google: data.google
          ? {
              created: data.google.created,
              // keep error for internal use / retry logic, but do not show directly to user
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

      // Build a human-readable notice summarising the 3 outcomes
      if (data?.ok) {
        const summaryParts: string[] = [];

        // 1) Website / portal user
        summaryParts.push('Portal user created.');

        // 2) Google Workspace user
        const googleCreated = data.google?.created;
        if (googleCreated === true) {
          summaryParts.push('Google Workspace account created.');
        } else if (googleCreated === false) {
          // keep this generic; don't show low-level errors like "invalid_grant"
          summaryParts.push('Google Workspace account not created yet.');
        }

        // 3) Onboarding email
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
        headers: {'Content-Type': 'application/json'}, // ← ADD THIS
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
    <div className={s.wrap}>
      <header className={s.head}>
        <h1>Create User (Auto-provision)</h1>
        <div className={s.emailPreview}>
          Email preview: <strong>{finalEmail}</strong>
          <div className={s.emailNote}>
            Final email and EMP ID are generated on submit to ensure uniqueness.
          </div>
        </div>
      </header>

      <div className={s.formWrap}>
        {notice && (
          <div
            className={`${s.notice} ${notice.kind === 'success' ? s.success : s.error}`}
          >
            {notice.msg}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className={s.grid}>
            <div className="form-group">
              <label className={`${s.required}`}>First name</label>
              <input
                className={s.input}
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className={s.required}>Surname</label>
              <input
                className={s.input}
                required
                value={surname}
                onChange={e => setSurname(e.target.value)}
              />
            </div>

            <div className={`${s.full}`}>
              <label className={s.required}>Personal email</label>
              <input
                className={s.input}
                required
                type="email"
                value={personalEmail}
                onChange={e => setPersonalEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className={s.required}>Nationality</label>
              <CountrySelect
                label=""
                value={nationality}
                onChange={setNationality}
              />
            </div>

            <div className="form-group">
              <label className={s.required}>Gender</label>
              <select
                className={s.select}
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

            <div className="form-group">
              <label>Phone (optional)</label>
              <input
                className={s.input}
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Birthdate (optional)</label>
              <input
                className={s.input}
                type="date"
                value={birthdate}
                onChange={e => setBirthdate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className={s.required}>Department</label>
              <select
                className={s.select}
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

            <div className="form-group">
              <label className={s.required}>Position</label>
              <select
                className={s.select}
                required
                value={selectedPosId}
                onChange={e =>
                  setSelectedPosId(e.target.value ? Number(e.target.value) : '')
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

            <div className="form-group">
              <label className={s.required}>Start date</label>
              <input
                className={s.input}
                required
                type="date"
                value={joiningDate}
                onChange={e => setJoiningDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>End date (optional)</label>
              <input
                className={s.input}
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className={s.required}>Employee Type</label>
              <select
                className={s.select}
                required
                value={empType}
                onChange={e => setEmpType(e.target.value as EmpType)}
              >
                <option value="intern">Intern</option>
                <option value="employee">Employee</option>
                <option value="team_lead">Team Lead</option>
              </select>
            </div>

            <div className="form-group">
              <label>Supervisor (optional)</label>
              <input
                className={s.input}
                value={supervisor}
                onChange={e => setSupervisor(e.target.value)}
              />
            </div>

            <div className={`${s.full}`}>
              <button
                type="submit"
                className={s.submitBtn}
                disabled={submitting || !canSubmit}
              >
                {submitting ? 'Creating…' : 'Create Google Account + Site User'}
              </button>
            </div>
          </div>
        </form>

        {err && <div className={s.errorText}>{err}</div>}

        {result && (
          <div className={s.resultBox}>
            <h3>Account provisioning result</h3>

            {/* Portal user status */}
            <div className={s.resultItem}>
              <div className={s.resultLabel}>Portal user:</div>
              <div>{result.ok === false ? 'Not created' : 'Created'}</div>
            </div>

            {/* Google Workspace status (no raw OAuth error shown to the user) */}
            <div className={s.resultItem}>
              <div className={s.resultLabel}>Google Workspace user:</div>
              <div>
                {result.google
                  ? result.google.created
                    ? 'Created'
                    : 'Not created yet – please contact HR/IT or retry below.'
                  : 'Not available'}
              </div>
            </div>

            {/* Onboarding email status */}
            <div className={s.resultItem}>
              <div className={s.resultLabel}>Onboarding email:</div>
              <div>
                {result.email
                  ? result.email.sent
                    ? 'Sent'
                    : 'Not sent'
                  : 'Not available'}
              </div>
            </div>

            {/* Retry actions – only show when relevant */}
            {result.companyEmail &&
              result.google &&
              result.google.created === false && (
                <div className={s.resultItem}>
                  <button
                    type="button"
                    className={s.retryButton}
                    onClick={retryGoogle}
                    disabled={submitting}
                  >
                    Retry Google account
                  </button>
                </div>
              )}

            {/* Existing details */}
            <div className={s.resultItem}>
              <div className={s.resultLabel}>Company Email:</div>
              <div>{result.companyEmail ?? '—'}</div>
            </div>
            <div className={s.resultItem}>
              <div className={s.resultLabel}>Employee ID:</div>
              <div>{result.empID ?? '—'}</div>
            </div>

            {result.tempPasswords && (
              <>
                <div className={s.resultItem}>
                  <div className={s.resultLabel}>Google temp password:</div>
                  <div className={s.code}>
                    {result.tempPasswords.google ?? '—'}
                  </div>
                </div>
                <div className={s.resultItem}>
                  <div className={s.resultLabel}>Site temp password:</div>
                  <div className={s.code}>
                    {result.tempPasswords.site ?? '—'}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
