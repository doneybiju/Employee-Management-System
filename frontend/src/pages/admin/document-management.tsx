// frontend/src/pages/admin/document-management.tsx
import {useEffect, useMemo, useRef, useState} from 'react';
import Head from 'next/head';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';

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
  // Intern => Internship Agreement
  // Employee + Team lead => Employment Agreement
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

const DOC_KEYS: Array<{kind: Kind; getter: keyof AdminDocs; icon: string}> = [
  {
    kind: 'acceptance_letter',
    getter: 'acceptanceLetter',
    icon: 'fa-file-contract',
  },
  {
    kind: 'learning_agreement',
    getter: 'learningAgreement',
    icon: 'fa-handshake',
  },
  {kind: 'passport_id', getter: 'passportId', icon: 'fa-passport'},
  {kind: 'cv', getter: 'cv', icon: 'fa-file-alt'},
];

// Map UI kinds → backend enum
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
  expiryDate: string; // ISO string from API
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

  // filters
  const [searchText, setSearchText] = useState('');
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

  const [passportExpiry, setPassportExpiry] = useState<string>(''); // YYYY-MM-DD

  // Passport expiry panel (right-side layer)
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

  // Load active interns list
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

  // Load docs-summary for filters
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

  // Load expiring passports when panel is open or months changes
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

  // turn any Drive link into our proxy if needed then blob it for auth’d <img>
  const toProxy = (u: string) => {
    const m =
      u.match(/[?&]id=([^&]+)/) ||
      u.match(/\/file\/d\/([^/]+)/) ||
      u.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
    return m ? `/api/uploads/drive/file/${m[1]}?name=avatar` : u;
  };
  useEffect(() => {
    const dead = false;
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

  // Load a user's document URLs
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

  // Selected user's avatar preview
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

  // Upload & replace
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

      // only send expiry for passport_id
      if (selectedKind === 'passport_id' && passportExpiry.trim()) {
        fd.append('expiryDate', passportExpiry.trim()); // YYYY-MM-DD
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

  // NEW: Deletions
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
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter(u =>
        String(u[searchField] || '')
          .toLowerCase()
          .includes(q),
      );
    }
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
  }, [users, searchText, searchField, docFilter, docSummary]);

  const hasAnyDocs = !!(
    docs?.acceptanceLetter ||
    docs?.learningAgreement ||
    docs?.passportId ||
    docs?.cv
  );

  return (
    <main className="container">
      <Head>
        <title>Document Management | Admin</title>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      <header className="header">
        <h1 className="header-title">Document Management</h1>
      </header>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="seg">
            <button
              className={`seg-btn ${searchField === 'firstName' ? 'active' : ''}`}
              onClick={() => setSearchField('firstName')}
            >
              First name
            </button>
            <button
              className={`seg-btn ${searchField === 'surname' ? 'active' : ''}`}
              onClick={() => setSearchField('surname')}
            >
              Surname
            </button>
          </div>

          <div className="search-wide">
            <i className="fas fa-search" />
            <input
              placeholder={`Search by ${searchField === 'firstName' ? 'first name' : 'surname'}…`}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="tabs-row">
          <div className="tabs">
            {[
              {k: 'all', label: 'All'},
              {k: 'missing_any', label: 'Missing Any'},
              {k: 'acceptance_letter', label: 'Acceptance Letter'},
              {
                k: 'learning_agreement',
                label: agreementLabelForEmpType(sel?.empType),
              },
              {k: 'passport_id', label: 'Passport ID'},
              {k: 'cv', label: 'CV / Resume'},
            ].map(t => (
              <button
                key={t.k}
                className={`tab ${docFilter === (t.k as DocFilter) ? 'active' : ''}`}
                onClick={() => setDocFilter(t.k as DocFilter)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tabs-right">
            <button
              className={`tab ${showExpiryPanel ? 'active' : ''}`}
              onClick={() => setShowExpiryPanel(v => !v)}
              title="Show interns with Passport ID expiring soon"
            >
              Passport expiring
            </button>
          </div>
        </div>
      </div>

      {showExpiryPanel && (
        <section className="expiry-panel">
          <div className="expiry-panel-head">
            <div>
              <div className="expiry-title">Passport ID expiring</div>
              <div className="expiry-subtitle">
                Shows interns with ID_PASSPORT expiring within the selected
                range.
              </div>
            </div>

            <button className="tab" onClick={() => setShowExpiryPanel(false)}>
              Close
            </button>
          </div>

          <div className="expiry-controls">
            <label className="expiry-label">
              Within
              <select
                value={expiryMonths}
                onChange={e => setExpiryMonths(parseInt(e.target.value, 10))}
                className="expiry-select"
              >
                {[1, 2, 3, 4, 5, 6].map(m => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="expiry-body">
            {expiryLoading ? (
              <div className="expiry-muted">Loading…</div>
            ) : expiryError ? (
              <div className="expiry-muted">{expiryError}</div>
            ) : expiryRows.length === 0 ? (
              <div className="expiry-muted">
                No passport IDs expiring in this range.
              </div>
            ) : (
              <div className="expiry-list">
                {expiryRows.map(r => {
                  const dateOnly = String(r.expiryDate).slice(0, 10);
                  const leftLabel =
                    r.daysLeft <= 0
                      ? 'Expired'
                      : `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left`;
                  return (
                    <div key={r.employeeId} className="expiry-row">
                      <div className="expiry-row-main">
                        <div className="expiry-name">{r.displayName}</div>
                        {r.companyEmail && (
                          <div className="expiry-email">{r.companyEmail}</div>
                        )}
                        <div className="expiry-meta">
                          Expiry: <b>{dateOnly}</b> · {leftLabel}
                        </div>
                      </div>

                      <div className="expiry-actions">
                        <button
                          className="tab"
                          onClick={() => {
                            const match = users.find(
                              u => u.employeeId === r.employeeId,
                            );
                            if (match) {
                              setSel(match);
                              loadDocs(match);
                            }
                          }}
                          title="Select this user"
                        >
                          Select
                        </button>

                        {r.filePath && (
                          <a
                            className="tab"
                            href={withToken(r.filePath) || r.filePath}
                            target="_blank"
                            rel="noreferrer"
                            title="Open document"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="main-content">
        {/* Left: user list */}
        <aside className="user-selection">
          <h2 className="section-title">Select User</h2>
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Search users…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="user-list">
            {loading && <div style={{padding: 12}}>Loading…</div>}
            {!loading &&
              filtered.map(u => {
                const key = String(u.employeeId); // consistent key
                const active = sel?.employeeId === u.employeeId; // consistent selection check

                return (
                  <div
                    key={key}
                    className={`user-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      setSel(u);
                      loadDocs(u);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      src={avatarMap[key] || '/account.png'} // read using same key
                      alt=""
                      onError={e => {
                        e.currentTarget.src = '/account.png';
                      }}
                    />

                    <div className="user-details">
                      <div className="user-name">{fullname(u)}</div>
                      <div className="user-role">
                        {[u.position, u.department]
                          .filter(Boolean)
                          .join(' · ') || 'Intern'}
                      </div>
                    </div>
                  </div>
                );
              })}
            {!loading && !filtered.length && (
              <div style={{padding: 12, color: '#7f8c8d'}}>
                No interns found.
              </div>
            )}
          </div>
        </aside>

        {/* Right: document area */}
        <section className="document-management">
          <div className="selected-user">
            <img
              src={selAvatarSrc || '/account.png'}
              alt={sel ? fullname(sel) : 'User avatar'}
              onError={e => {
                e.currentTarget.src = '/account.png';
              }}
            />
            <div className="user-info-text">
              <h3>{sel ? fullname(sel) : '—'}</h3>
              <p>
                {sel
                  ? [sel.position, sel.department]
                      .filter(Boolean)
                      .join(' · ') || 'Intern'
                  : 'Pick a user from the left'}
              </p>
            </div>
            {/* Delete avatar */}
            <div style={{marginLeft: 'auto'}}>
              <button
                className="mini-danger"
                onClick={deleteAvatar}
                disabled={!sel?.employeeId || !selAvatarSrc || busy}
                title="Delete profile picture"
              >
                <i className="fas fa-trash" /> Delete avatar
              </button>
            </div>
          </div>

          <div className="upload-section">
            <h2 className="section-title">Upload Document</h2>

            <div className="upload-card">
              <div className="upload-icon">
                <i className="fas fa-cloud-upload-alt" />
              </div>

              <div className="upload-text">
                <h4>Upload a document</h4>
                <p>Supported: PDF only (Max 15MB)</p>
              </div>
              <input
                id="file-input"
                className="file-input"
                type="file"
                accept="application/pdf"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  if (!f) return setFile(null);
                  const isPdf =
                    (f.type || '').toLowerCase() === 'application/pdf' ||
                    /\.pdf$/i.test(f.name);
                  if (!isPdf) {
                    alert('Only PDF files are allowed.');
                    e.currentTarget.value = '';
                    return;
                  }
                  setFile(f);
                }}
              />
              <button
                className="browse-btn"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                {file ? `Selected: ${file.name}` : 'Browse Files'}
              </button>
            </div>

            {selectedKind === 'passport_id' && (
              <div style={{margin: '12px 0'}}>
                <label
                  style={{display: 'block', fontWeight: 600, marginBottom: 6}}
                >
                  Passport expiry date (optional)
                </label>
                <input
                  type="date"
                  value={passportExpiry}
                  onChange={e => setPassportExpiry(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                  }}
                />
              </div>
            )}

            <div className="document-type">
              {DOC_KEYS.map(d => {
                const url = docs ? docs[d.getter] : null;
                const driveId = driveIdFromUrl(url || undefined);
                const fname = `${sel?.firstName || 'User'}_${sel?.surname || ''}_${kindLabel(d.kind, sel?.empType).replace(/\s+/g, '_')}.pdf`;
                const dlHrefRaw = driveId
                  ? `/api/uploads/drive/file/${encodeURIComponent(driveId)}?name=${encodeURIComponent(fname)}`
                  : '#';
                const dlHref = withToken(dlHrefRaw) || undefined;
                const uploaded = !!url;
                return (
                  <div
                    key={d.kind}
                    className={`doc-type-btn ${selectedKind === d.kind ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedKind(d.kind)}
                  >
                    <div className="doc-icon">
                      <i className={`fas ${d.icon}`} />
                    </div>
                    <div className="doc-info">
                      <h4>{kindLabel(d.kind, sel?.empType)}</h4>
                      <p>
                        {d.kind === 'passport_id'
                          ? 'Identification document'
                          : d.kind === 'cv'
                            ? 'Curriculum vitae'
                            : d.kind === 'learning_agreement'
                              ? sel?.empType === 'intern'
                                ? 'Internship agreement terms'
                                : 'Employment agreement terms'
                              : 'Official acceptance document'}
                      </p>
                      <div className="doc-status">
                        <span
                          className={`status-indicator ${uploaded ? 'status-uploaded' : 'status-pending'}`}
                        >
                          <i
                            className={`fas ${uploaded ? 'fa-check-circle' : 'fa-clock'}`}
                          />{' '}
                          {uploaded ? 'Uploaded' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Download */}
                    {uploaded && driveId && (
                      <button
                        className="doc-action download-action"
                        title="Download"
                        onClick={e => {
                          e.stopPropagation();
                          const apiUrl = `/api/uploads/drive/file/${encodeURIComponent(driveId)}?name=${encodeURIComponent(fname)}`;
                          downloadWithAuth(apiUrl, fname);
                        }}
                      >
                        <i className="fas fa-download" />
                      </button>
                    )}

                    {/* Delete */}
                    {uploaded && (
                      <button
                        className="doc-action delete-action"
                        title="Delete document"
                        onClick={e => {
                          e.stopPropagation();
                          void deleteDoc(d.kind);
                        }}
                        disabled={busy || !sel?.employeeId}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              className="upload-btn"
              disabled={!sel?.employeeId || !file || busy}
              onClick={upload}
            >
              {busy ? 'Working…' : 'Upload / Replace'}
            </button>

            {/* Bulk actions */}
            <div style={{display: 'flex', gap: 10, marginTop: 12}}>
              <button
                className="mini-danger"
                onClick={deleteAllDocs}
                disabled={!sel?.employeeId || !hasAnyDocs || busy}
                title="Delete all 4 documents"
              >
                <i className="fas fa-trash" /> Delete all documents
              </button>
            </div>
          </div>
        </section>
      </div>

      {toast && <div className={'toast show'}>{toast}</div>}

      <style jsx>{`
        * {
          box-sizing: border-box;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e1e4e8;
        }
        .header-title {
          font-size: 28px;
          color: #2c3e50;
          font-weight: 600;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          padding: 10px 15px;
          border-radius: 8px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
        }
        .user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }
        .main-content {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 25px;
        }
        .user-selection {
          background: #fff;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          height: fit-content;
        }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #2c3e50;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e1e4e8;
        }
        .search-box {
          position: relative;
          margin-bottom: 20px;
        }
        .search-box i {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #7f8c8d;
        }
        .search-box input {
          width: 100%;
          padding: 12px 15px 12px 45px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 16px;
        }
        .user-list {
          max-height: 430px;
          overflow-y: auto;
        }
        .user-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.3s;
          margin-bottom: 8px;
        }
        .user-item:hover {
          background: #f1f5f9;
        }
        .user-item.active {
          background: #e3f2fd;
        }
        .user-item img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 12px;
        }
        .user-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        .user-role {
          font-size: 12px;
          color: #7f8c8d;
        }
        .document-management {
          background: #fff;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .selected-user {
          display: flex;
          align-items: center;
          margin-bottom: 25px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e1e4e8;
        }
        .selected-user img {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 15px;
        }
        .upload-section {
          margin-bottom: 30px;
        }
        .upload-card {
          background: #f8f9fa;
          border: 2px dashed #d1d8e0;
          border-radius: 12px;
          padding: 25px;
          text-align: center;
          margin-bottom: 20px;
        }
        .upload-icon {
          font-size: 40px;
          color: #4a6cf7;
          margin-bottom: 15px;
        }
        .upload-text h4 {
          font-size: 18px;
          margin-bottom: 8px;
        }
        .upload-text p {
          color: #7f8c8d;
        }
        .file-input {
          display: none;
        }

        .doc-status {
          display: flex;
          align-items: center;
          font-size: 12px;
          margin-top: 5px;
        }
        .status-indicator {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 12px;
          font-weight: 500;
          margin-right: 8px;
        }
        .status-uploaded {
          background: #e1f7e3;
          color: #27ae60;
        }
        .status-pending {
          background: #fef5e7;
          color: #e67e22;
        }
        .doc-action {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.85;
          transition: opacity 0.3s;
          border: none;
        }
        .doc-action:hover {
          opacity: 1;
        }
        .download-action {
          background: #e3f2fd;
          color: #4a6cf7;
        }
        .delete-action {
          background: #fee2e2;
          color: #ef4444;
          right: 42px;
        }
        .doc-type-btn {
          position: relative;
        }

        .filter-bar {
          background: #fff;
          border-radius: 12px;
          padding: 16px 20px;
          margin: 0 0 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .filter-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .seg {
          display: inline-flex;
          border: 1px solid #e1e4e8;
          border-radius: 10px;
          overflow: hidden;
        }
        .seg-btn {
          padding: 8px 12px;
          border: none;
          background: #fff;
          cursor: pointer;
        }
        .seg-btn.active {
          background: #4a6cf7;
          color: #fff;
        }
        .search-wide {
          position: relative;
          flex: 1;
          min-width: 220px;
        }
        .search-wide i {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #7f8c8d;
        }
        .search-wide input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 15px;
        }
        .tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tab {
          padding: 8px 12px;
          border: 1px solid #e1e4e8;
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
        }
        .tab.active {
          background: #f0f4ff;
          border-color: #4a6cf7;
          color: #4a6cf7;
        }

        .browse-btn {
          background: #4a6cf7;
          color: #fff;
          border: none;
          padding: 12px 25px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.3s;
        }
        .browse-btn:hover {
          background: #3b5be3;
        }
        .document-type {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }
        .doc-type-btn {
          display: flex;
          align-items: center;
          padding: 15px;
          border: 1px solid #e1e4e8;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
          background: #fff;
        }
        .doc-type-btn:hover {
          border-color: #4a6cf7;
        }
        .doc-type-btn.active {
          border-color: #4a6cf7;
          background: #f0f4ff;
        }
        .doc-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: #e3f2fd;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 15px;
          color: #4a6cf7;
          font-size: 18px;
        }
        .upload-btn {
          background: #10b981;
          color: #fff;
          border: none;
          padding: 12px 25px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.3s;
          width: 100%;
          font-size: 16px;
        }
        .upload-btn:hover {
          background: #0da271;
        }
        .upload-btn:disabled {
          background: #c1c8d0;
          cursor: not-allowed;
        }

        .mini-danger {
          background: #fee2e2;
          color: #b91c1c;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
        }
        .mini-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tabs-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tabs-right {
          margin-left: auto;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Right-side layer panel */
        .expiry-panel {
          position: fixed;
          right: 24px;
          top: 120px;
          width: 420px;
          max-width: 92vw;
          max-height: 70vh;
          overflow: auto;
          background: #fff;
          border: 1px solid #e1e4e8;
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
          z-index: 1200;
        }
        .expiry-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .expiry-title {
          font-size: 16px;
          font-weight: 700;
          color: #2c3e50;
        }
        .expiry-subtitle {
          font-size: 12px;
          color: #7f8c8d;
          margin-top: 4px;
        }
        .expiry-controls {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .expiry-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #2c3e50;
        }
        .expiry-select {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid #ddd;
          background: #fff;
        }
        .expiry-body {
          font-size: 13px;
        }
        .expiry-muted {
          color: #7f8c8d;
        }
        .expiry-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .expiry-row {
          border: 1px solid #eee;
          border-radius: 12px;
          padding: 10px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }
        .expiry-name {
          font-weight: 700;
        }
        .expiry-email {
          font-size: 12px;
          color: #7f8c8d;
          margin-top: 2px;
        }
        .expiry-meta {
          font-size: 12px;
          color: #2c3e50;
          margin-top: 6px;
        }
        .expiry-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }

        .toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #10b981;
          color: #fff;
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
        }
        @media (max-width: 900px) {
          .main-content {
            grid-template-columns: 1fr;
          }
          .document-type {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
