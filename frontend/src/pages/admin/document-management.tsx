// frontend/src/pages/admin/document-management.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Head from 'next/head';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {
  Search,
  FileText,
  File,
  Download,
  Trash2,
  UploadCloud,
  CheckCircle,
  Clock,
  User as UserIcon,
  X,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

type Role = 'intern' | 'hr' | 'super_admin';
type Kind = 'acceptance_letter' | 'learning_agreement' | 'passport_id' | 'cv';

type UserRow = {
  id: number;
  firstName: string;
  surname: string;
  role: Role;
  empType?: EmpType | null;
  department: string | null;
  position: string | null;
  status: 'active' | 'inactive' | null;
  employeeId: string | null;
  companyEmail: string | null;
  personalEmail: string | null;
  avatarUrl?: string | null;
};

type AdminDocs = {
  acceptanceLetter: string | null;
  learningAgreement: string | null;
  passportId: string | null;
  cv: string | null;
};

type SearchField = 'firstName' | 'surname';
type DocFilter =
  | 'all'
  | 'missing_any'
  | 'acceptance_letter'
  | 'learning_agreement'
  | 'passport_id'
  | 'cv';
type EmpType = 'intern' | 'employee' | 'team_lead';

const agreementLabelForEmpType = (empType?: EmpType | null) => {
  return empType === 'intern' ? 'Internship Agreement' : 'Employment Agreement';
};

const kindLabel = (kind: Kind, empType?: EmpType | null) => {
  switch (kind) {
    case 'acceptance_letter':
      return 'Acceptance Letter';
    case 'learning_agreement':
      return agreementLabelForEmpType(empType);
    case 'passport_id':
      return 'Passport ID';
    case 'cv':
      return 'CV / Resume';
    default:
      return kind;
  }
};

const DOC_KEYS: Array<{
  kind: Kind;
  getter: keyof AdminDocs;
  Icon: typeof FileText;
}> = [
  {
    kind: 'acceptance_letter',
    getter: 'acceptanceLetter',
    Icon: FileText,
  },
  {
    kind: 'learning_agreement',
    getter: 'learningAgreement',
    Icon: File,
  },
  {kind: 'passport_id', getter: 'passportId', Icon: Briefcase},
  {kind: 'cv', getter: 'cv', Icon: UserIcon},
];

const DOC_TYPE_MAP: Record<
  Kind,
  'ACCEPTANCE_LETTER' | 'LEARNING_AGREEMENT' | 'ID_PASSPORT' | 'CV'
> = {
  acceptance_letter: 'ACCEPTANCE_LETTER',
  learning_agreement: 'LEARNING_AGREEMENT',
  passport_id: 'ID_PASSPORT',
  cv: 'CV',
};

type ExpiringPassportRow = {
  employeeId: string;
  userId: number | null;
  displayName: string;
  companyEmail: string | null;
  expiryDate: string;
  daysLeft: number;
  filePath: string | null;
};

function driveIdFromUrl(u?: string | null) {
  if (!u) return null;
  const m1 = u.match(/[?&]id=([^&]+)/);
  if (m1) return decodeURIComponent(m1[1]);
  const m2 = u.match(/\/file\/d\/([^/]+)/);
  if (m2) return m2[1];
  const m3 = u.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
  if (m3) return m3[1];
  return null;
}
const fullname = (u?: Pick<UserRow, 'firstName' | 'surname'> | null) =>
  u ? `${u.firstName} ${u.surname}`.trim() : '';

export default function AdminDocumentManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);

  const [searchField, setSearchField] = useState<SearchField>('firstName');
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [docSummary, setDocSummary] = useState<
    Record<
      string,
      {
        acc: boolean;
        la: boolean;
        pid: boolean;
        cv: boolean;
        missingAny: boolean;
      }
    >
  >({});

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const [sel, setSel] = useState<UserRow | null>(null);
  const [docs, setDocs] = useState<AdminDocs | null>(null);

  const [selectedKind, setSelectedKind] = useState<Kind>('acceptance_letter');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [passportExpiry, setPassportExpiry] = useState<string>('');

  const [showExpiryPanel, setShowExpiryPanel] = useState(false);
  const [expiryMonths, setExpiryMonths] = useState<number>(1);
  const [expiryRows, setExpiryRows] = useState<ExpiringPassportRow[]>([]);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryError, setExpiryError] = useState<string | null>(null);

  const [selAvatarSrc, setSelAvatarSrc] = useState<string | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const {token} = useAuth();
  const withToken = (u?: string | null) => {
    if (!u) return u ?? null;
    if (!token) return u;
    if (!u.startsWith('/api/uploads/drive/file/')) return u;
    const [base, q = ''] = u.split('?');
    const sp = new URLSearchParams(q);
    sp.set('token', token);
    return `${base}?${sp.toString()}`;
  };

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(
          `/api/admin/users?tab=active&q=${encodeURIComponent(q)}`,
        );
        const rows = await res.json();
        if (!dead) setUsers((rows || []).filter((r: any) => !!r.employeeId));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [q]);

  useEffect(() => {
    const employeeIds = users
      .filter(u => u.employeeId)
      .map(u => String(u.employeeId));
    if (!employeeIds.length) {
      setDocSummary({});
      return;
    }
    let dead = false;
    (async () => {
      try {
        const url = `/api/admin/users/docs-summary?ids=${encodeURIComponent(employeeIds.join(','))}`;
        const res = await fetchWithAuth(url);
        const j = await res.json();
        if (!dead) setDocSummary(j?.byIntern || {});
      } catch {
        if (!dead) setDocSummary({});
      }
    })();
    return () => {
      dead = true;
    };
  }, [users]);

  useEffect(() => {
    if (!showExpiryPanel) return;

    let dead = false;
    (async () => {
      try {
        setExpiryLoading(true);
        setExpiryError(null);

        const res = await fetchWithAuth(
          `/api/admin/documents/expiring-passports?months=${expiryMonths}`,
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

        if (!dead) setExpiryRows((j?.rows || []) as ExpiringPassportRow[]);
      } catch (e: any) {
        if (!dead) {
          setExpiryRows([]);
          setExpiryError(e?.message || 'Failed to load expiring passports');
        }
      } finally {
        if (!dead) setExpiryLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, [showExpiryPanel, expiryMonths]);

  const toProxy = (u: string) => {
    const m =
      u.match(/[?&]id=([^&]+)/) ||
      u.match(/\/file\/d\/([^/]+)/) ||
      u.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
    return m ? `/api/uploads/drive/file/${m[1]}?name=avatar` : u;
  };
  useEffect(() => {
    const toRevoke: string[] = [];
    (async () => {
      const next: Record<number, string> = {};
      for (const u of users) {
        const raw = u.avatarUrl;
        if (!raw) continue;
        const url = toProxy(raw);
        try {
          if (url.startsWith('/api/uploads/drive/file/')) {
            const resp = await fetchWithAuth(url);
            if (!resp.ok) throw new Error(String(resp.status));
            const blob = await resp.blob();
            const obj = URL.createObjectURL(blob);
            if (!u.employeeId) continue;
            next[u.employeeId] = obj;
            toRevoke.push(obj);
          } else {
            next[u.id] = url;
          }
        } catch {
          /* ignore */
        }
      }
      setAvatarMap(next);
    })();
    return () => {
      toRevoke.forEach(URL.revokeObjectURL);
    };
  }, [users]);

  async function loadDocs(u: UserRow | null) {
    setDocs(null);
    if (!u?.employeeId) return;
    const res = await fetchWithAuth(
      `/api/profile/admin/documents/${u.employeeId}`,
    );
    const j = await res.json();
    setDocs({
      acceptanceLetter: j?.documents?.acceptanceLetter ?? null,
      learningAgreement: j?.documents?.learningAgreement ?? null,
      passportId: j?.documents?.passportId ?? null,
      cv: j?.documents?.cv ?? null,
    });
    if (j?.avatarUrl) {
      setSel(prev =>
        prev && prev.employeeId === u.employeeId
          ? {...prev, avatarUrl: j.avatarUrl}
          : prev,
      );
    }
  }

  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      setSelAvatarSrc(null);
      const urlIn = sel?.avatarUrl;
      if (!urlIn) return;
      let url = urlIn;
      const m = url.match(/[?&]id=([^&]+)/) || url.match(/\/file\/d\/([^/]+)/);
      if (m) url = `/api/uploads/drive/file/${m[1]}?name=avatar`;
      try {
        if (url.startsWith('/api/uploads/drive/file/')) {
          const resp = await fetchWithAuth(url);
          if (!resp.ok) throw new Error(String(resp.status));
          const blob = await resp.blob();
          const objUrl = URL.createObjectURL(blob);
          revoke = objUrl;
          setSelAvatarSrc(objUrl);
        } else {
          setSelAvatarSrc(url);
        }
      } catch {
        setSelAvatarSrc(null);
      }
    })();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [sel?.avatarUrl]);

  async function upload() {
    if (!sel?.employeeId) return alert('Pick a user first');
    if (!file) return alert('Choose a file');
    if (
      !/\.pdf$/i.test(file.name) &&
      (file.type || '').toLowerCase() !== 'application/pdf'
    ) {
      return alert('Only PDF files are allowed.');
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('employeeId', sel.employeeId);

      if (selectedKind === 'passport_id' && passportExpiry.trim()) {
        fd.append('expiryDate', passportExpiry.trim());
      }

      const upRes = await fetchWithAuth(
        `/api/uploads/drive/document/${selectedKind}`,
        {
          method: 'POST',
          body: fd as any,
        },
      );
      const up = await upRes.json();
      if (!upRes.ok) throw new Error(up?.error || `HTTP ${upRes.status}`);

      await fetchWithAuth(
        `/api/profile/admin/documents/${sel.employeeId}/${selectedKind}/complete`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            url: up?.url,
            fileId: up?.fileId,
            originalName: up?.originalName,
            mimeType: up?.mimeType,
            fileSize: up?.fileSize,
          }),
        },
      );

      setFile(null);
      await loadDocs(sel);
      showToast('Document uploaded');
    } catch (e: any) {
      alert(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function downloadWithAuth(url: string, filename: string) {
    try {
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 0);
    } catch (e: any) {
      alert(e?.message || 'Download failed');
    }
  }

  async function deleteDoc(kind: Kind) {
    if (!sel?.employeeId) return;
    if (
      !confirm(`Delete ${kindLabel(kind, sel?.empType)} for ${fullname(sel)}?`)
    )
      return;
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/admin/documents/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          employeeId: sel.employeeId,
          documentType: DOC_TYPE_MAP[kind],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      await loadDocs(sel);
      showToast('Document deleted');
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllDocs() {
    if (!sel?.employeeId) return;
    if (!confirm(`Delete ALL 4 documents for ${fullname(sel)}?`)) return;
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/admin/documents/delete-all', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({employeeId: sel.employeeId}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      await loadDocs(sel);
      showToast('All documents deleted');
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvatar() {
    if (!sel?.employeeId) return;
    if (!confirm(`Delete profile avatar for ${fullname(sel)}?`)) return;
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/admin/avatar/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({employeeId: sel.employeeId}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setSel(prev => (prev ? {...prev, avatarUrl: null} : prev));
      setSelAvatarSrc(null);
      showToast('Avatar deleted');
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    let rows = users;
    // Note: Text filtering is handled by API via 'q'
    if (docFilter !== 'all') {
      rows = rows.filter(u => {
        if (!u.employeeId) return false;
        const s = docSummary[String(u.employeeId)];
        if (!s) return docFilter !== 'missing_any' ? false : true;
        if (docFilter === 'missing_any') return s.missingAny;
        if (docFilter === 'acceptance_letter') return !s.acc;
        if (docFilter === 'learning_agreement') return !s.la;
        if (docFilter === 'passport_id') return !s.pid;
        if (docFilter === 'cv') return !s.cv;
        return true;
      });
    }
    return rows;
  }, [users, q, searchField, docFilter, docSummary]);

  const hasAnyDocs = !!(
    docs?.acceptanceLetter ||
    docs?.learningAgreement ||
    docs?.passportId ||
    docs?.cv
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <Head>
        <title>Document Management | Admin</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 shrink-0 pl-16">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Document Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage intern documents and agreements
          </p>
        </div>
        <button
          onClick={() => setShowExpiryPanel(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showExpiryPanel
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/20'
          }`}
        >
          <Clock size={16} /> Passport Expiry
        </button>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        {/* Left: User List */}
        <aside className="w-80 flex flex-col bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 space-y-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                placeholder="Search users..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex gap-1 p-1 bg-gray-50 dark:bg-[#1A1A1A] rounded-lg">
              <button
                className={`flex-1 py-1 text-xs font-medium rounded ${
                  searchField === 'firstName'
                    ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                }`}
                onClick={() => setSearchField('firstName')}
              >
                First Name
              </button>
              <button
                className={`flex-1 py-1 text-xs font-medium rounded ${
                  searchField === 'surname'
                    ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                }`}
                onClick={() => setSearchField('surname')}
              >
                Surname
              </button>
            </div>
            <select
              value={docFilter}
              onChange={e => setDocFilter(e.target.value as DocFilter)}
              className="w-full p-2 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value="all">All Users</option>
              <option value="missing_any">Missing Any Document</option>
              <option value="acceptance_letter">
                Missing Acceptance Letter
              </option>
              <option value="learning_agreement">Missing Agreement</option>
              <option value="passport_id">Missing Passport ID</option>
              <option value="cv">Missing CV</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No users found.
              </div>
            ) : (
              filtered.map(u => {
                const active = sel?.employeeId === u.employeeId;
                return (
                  <button
                    key={String(u.employeeId)}
                    onClick={() => {
                      setSel(u);
                      loadDocs(u);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800'
                        : 'hover:bg-gray-50 dark:hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden shrink-0">
                      <img
                        src={avatarMap[String(u.employeeId)] || '/account.png'}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.src = '/account.png';
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-semibold truncate ${
                          active
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {fullname(u)}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {[u.position, u.department]
                          .filter(Boolean)
                          .join(' · ') || 'Intern'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Document Area */}
        <section className="flex-1 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0 border-2 border-white dark:border-[#222] shadow-sm">
                <img
                  src={selAvatarSrc || '/account.png'}
                  alt={sel ? fullname(sel) : 'Avatar'}
                  className="w-full h-full object-cover"
                  onError={e => {
                    e.currentTarget.src = '/account.png';
                  }}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {sel ? fullname(sel) : 'Select a User'}
                </h2>
                <p className="text-gray-500 text-sm">
                  {sel
                    ? [sel.position, sel.department]
                        .filter(Boolean)
                        .join(' · ') || 'Intern'
                    : 'Pick a user from the left list to manage documents'}
                </p>
              </div>
            </div>
            {sel?.employeeId && selAvatarSrc && (
              <button
                onClick={deleteAvatar}
                disabled={busy}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete Avatar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Upload Area */}
            <div className="bg-gray-50 dark:bg-[#1A1A1A] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center mb-8 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <UploadCloud size={24} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Upload Document
              </h3>
              <p className="text-gray-500 text-xs mb-4">
                Supported: PDF only (Max 15MB)
              </p>

              <input
                id="file-input"
                className="hidden"
                type="file"
                accept="application/pdf"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  if (!f) return setFile(null);
                  if (
                    (f.type || '').toLowerCase() !== 'application/pdf' &&
                    !/\.pdf$/i.test(f.name)
                  ) {
                    alert('Only PDF files are allowed.');
                    e.currentTarget.value = '';
                    return;
                  }
                  setFile(f);
                }}
              />
              <button
                onClick={() => document.getElementById('file-input')?.click()}
                className="px-4 py-2 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-sm"
              >
                {file ? `Selected: ${file.name}` : 'Browse Files'}
              </button>

              {selectedKind === 'passport_id' && (
                <div className="mt-4 max-w-xs mx-auto text-left">
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    Passport Expiry (Optional)
                  </label>
                  <input
                    type="date"
                    value={passportExpiry}
                    onChange={e => setPassportExpiry(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            {/* Document Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {DOC_KEYS.map(d => {
                const url = docs ? docs[d.getter] : null;
                const driveId = driveIdFromUrl(url || undefined);
                const fname = `${sel?.firstName || 'User'}_${sel?.surname || ''}_${kindLabel(d.kind, sel?.empType).replace(/\s+/g, '_')}.pdf`;
                const uploaded = !!url;
                const isActive = selectedKind === d.kind;

                return (
                  <div
                    key={d.kind}
                    onClick={() => setSelectedKind(d.kind)}
                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      isActive
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] hover:border-blue-200 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`p-3 rounded-lg shrink-0 ${
                          isActive
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        <d.Icon size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                          {kindLabel(d.kind, sel?.empType)}
                        </h4>
                        <div className="flex items-center gap-2 mb-3">
                          {uploaded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                              <CheckCircle size={12} /> Uploaded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                              <Clock size={12} /> Pending
                            </span>
                          )}
                        </div>

                        {uploaded && (
                          <div className="flex gap-2">
                            {driveId && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const apiUrl = `/api/uploads/drive/file/${encodeURIComponent(driveId)}?name=${encodeURIComponent(fname)}`;
                                  downloadWithAuth(apiUrl, fname);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title="Download"
                              >
                                <Download size={16} />
                              </button>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                void deleteDoc(d.kind);
                              }}
                              disabled={busy || !sel?.employeeId}
                              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={upload}
                disabled={!sel?.employeeId || !file || busy}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {busy ? 'Working...' : 'Upload / Replace'}
              </button>
              <button
                onClick={deleteAllDocs}
                disabled={!sel?.employeeId || !hasAnyDocs || busy}
                className="px-4 py-2.5 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Delete All
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Expiry Panel */}
      {showExpiryPanel && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-[#111] border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 transform transition-transform animate-[slideInRight_0.3s_ease]">
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                Passport Expiry
              </h3>
              <button
                onClick={() => setShowExpiryPanel(false)}
                className="text-gray-500 hover:text-gray-900 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Expiring within
              </label>
              <select
                value={expiryMonths}
                onChange={e => setExpiryMonths(parseInt(e.target.value, 10))}
                className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {[1, 2, 3, 4, 5, 6].map(m => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {expiryLoading ? (
                <div className="text-center text-gray-500 text-sm py-4">
                  Loading...
                </div>
              ) : expiryError ? (
                <div className="text-center text-red-500 text-sm py-4">
                  {expiryError}
                </div>
              ) : expiryRows.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8 bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                  No expiring passports found.
                </div>
              ) : (
                expiryRows.map(r => {
                  const dateOnly = String(r.expiryDate).slice(0, 10);
                  const isExpired = r.daysLeft <= 0;
                  return (
                    <div
                      key={r.employeeId}
                      className="p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-xl border border-gray-100 dark:border-gray-800"
                    >
                      <div className="mb-2">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {r.displayName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.companyEmail}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs mb-3">
                        <AlertCircle
                          size={14}
                          className={
                            isExpired ? 'text-red-500' : 'text-amber-500'
                          }
                        />
                        <span
                          className={`font-medium ${
                            isExpired ? 'text-red-600' : 'text-amber-600'
                          }`}
                        >
                          {isExpired ? 'Expired' : `${r.daysLeft} days left`}
                        </span>
                        <span className="text-gray-400">({dateOnly})</span>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            const match = users.find(
                              u => u.employeeId === r.employeeId,
                            );
                            if (match) {
                              setSel(match);
                              loadDocs(match);
                              setShowExpiryPanel(false);
                            }
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          Select
                        </button>
                        {r.filePath && (
                          <a
                            href={withToken(r.filePath) || r.filePath}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-xl shadow-xl z-50 text-sm font-medium animate-[fadeInUp_0.3s_ease-out] flex items-center gap-2">
          <CheckCircle
            size={16}
            className="text-green-400 dark:text-green-600"
          />
          {toast}
        </div>
      )}
    </div>
  );
}
