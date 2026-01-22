// frontend/src/pages/profile.tsx
import {useEffect, useRef, useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import AvatarCropper from '@/components/AvatarCropper';

type EmpType = 'intern' | 'employee' | 'team_lead';

type Role = 'intern' | 'hr' | 'super_admin';

type Docs = {
  acceptanceLetter: string | null;
  learningAgreement: string | null;
  passportId: string | null;
  passportExpiryDate?: string | null;
  cv: string | null;
  linkedin: string | null;
};

type Profile = {
  firstName: string;
  surname: string;
  role: Role;
  empType?: EmpType | null;
  companyEmail: string;
  personalEmail: string | null;
  nationality: string | null;
  gender: string | null;
  birthdate: string | null;
  phone: string | null;
  supervisor: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  department: string | null;
  position: string | null;
  avatarUrl: string | null;
  sos?: {relativePhoneNumber: string | null; relationWithIntern: string | null};
  documents?: Docs;
};

const normDocs = (d?: Partial<Docs> | null): Docs => ({
  acceptanceLetter: d?.acceptanceLetter ?? null,
  learningAgreement: d?.learningAgreement ?? null,
  passportId: d?.passportId ?? null,
  passportExpiryDate: d?.passportExpiryDate ?? null,
  cv: d?.cv ?? null,
  linkedin: d?.linkedin ?? null,
});

const kindKey = {
  acceptance_letter: 'acceptanceLetter',
  learning_agreement: 'learningAgreement',
  passport_id: 'passportId',
  cv: 'cv',
} as const;

const DEFAULT_AVATAR = '/account.png';

function agreementLabel(empType?: EmpType | null) {
  return empType === 'intern' ? 'Internship Agreement' : 'Employment Agreement';
}

function fileToDataURL(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const [toast, setToast] = useState<{
    message: string;
    kind: 'success' | 'error';
  } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [upAvatar, setUpAvatar] = useState(false);
  const [savingSOS, setSavingSOS] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);

  // Avatar cropping UI state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function showToast(message: string, kind: 'success' | 'error' = 'success') {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({message, kind});
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  const {user, loading} = useAuth();
  const [data, setData] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // editable fields
  const [sosPhone, setSosPhone] = useState('');
  const [sosRelation, setSosRelation] = useState('');
  const [linkedin, setLinkedin] = useState('');

  // upload states
  // const [upAvatar, setUpAvatar] = useState(false);
  // const [savingSOS, setSavingSOS] = useState(false);
  // const [savingSocial, setSavingSocial] = useState(false);

  // allow ALL logged-in roles to edit their own profile
  const canEdit = !!user;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/profile');
        const d = await res.json();
        if (dead) return;

        const toStr = (v: any) => (v ? String(v) : null);
        const normalized: Profile = {
          ...d,
          birthdate: toStr(d.birthdate),
          startDate: toStr(d.startDate),
          endDate: toStr(d.endDate),
          documents: normDocs(d.documents),
        };
        setData(normalized);

        setSosPhone(d?.sos?.relativePhoneNumber || '');
        setSosRelation(d?.sos?.relationWithIntern || '');
        setLinkedin(d?.documents?.linkedin || '');
      } catch (e: any) {
        if (!dead) setErr(e?.message || 'Failed to load profile');
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // Avatar source managed locally so we can use an authenticated blob URL
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR);

  useEffect(() => {
    let revoke: string | null = null;

    (async () => {
      if (!data?.avatarUrl) {
        setAvatarSrc(DEFAULT_AVATAR);
        return;
      }

      // If backend gave a Google link, convert to proxy first
      let url = data.avatarUrl;
      if (/^https?:\/\/(drive\.google\.com|docs\.google\.com)\//i.test(url)) {
        const m =
          url.match(/[?&]id=([^&]+)/) || url.match(/\/file\/d\/([^/]+)/);
        if (m) url = `/api/uploads/drive/file/${m[1]}?name=avatar`;
      }

      try {
        if (url.startsWith('/api/uploads/drive/file/')) {
          const token = localStorage.getItem('token') || '';
          const resp = await fetch(url, {
            headers: {Authorization: `Bearer ${token}`},
          });
          if (!resp.ok) throw new Error(String(resp.status));
          const blob = await resp.blob();
          const obj = URL.createObjectURL(blob);
          revoke = obj;
          setAvatarSrc(obj);
        } else {
          setAvatarSrc(url); // public URL (rare)
        }
      } catch {
        setAvatarSrc(DEFAULT_AVATAR);
      }
    })();

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [data?.avatarUrl]);

  async function uploadAvatarBlob(
    blob: Blob,
    fileName = 'avatar.webp',
    mime = 'image/webp',
  ) {
    try {
      setUpAvatar(true);
      const fd = new FormData();
      // pass a filename so Drive / backend stores a nice name
      fd.append('file', blob, fileName);

      const upRes = await fetchWithAuth('/api/uploads/drive/avatar', {
        method: 'POST',
        body: fd as any,
      });
      const up = await upRes.json();
      if (!up?.url) throw new Error('Upload did not return url');

      await fetchWithAuth('/api/profile/avatar/complete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          url: up.url,
          fileId: up.fileId,
          originalName: fileName,
          mimeType: mime,
          fileSize: blob.size,
        }),
      });

      setData(p => (p ? {...p, avatarUrl: up.url} : p));
      showToast('Avatar updated', 'success');
    } catch (e: any) {
      alert(e?.message || 'Avatar upload failed');
    } finally {
      setUpAvatar(false);
    }
  }

  async function saveSOS() {
    try {
      setSavingSOS(true);
      await fetchWithAuth('/api/profile/sos', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          relativePhoneNumber: sosPhone || null,
          relationWithIntern: sosRelation || null,
        }),
      });
      setData(p =>
        p
          ? {
              ...p,
              sos: {
                relativePhoneNumber: sosPhone || null,
                relationWithIntern: sosRelation || null,
              },
            }
          : p,
      );
      showToast('SOS information saved', 'success');
    } catch (e: any) {
      alert(e?.message || 'Failed to save SOS');
    } finally {
      setSavingSOS(false);
    }
  }

  async function saveSocial() {
    try {
      setSavingSocial(true);
      await fetchWithAuth('/api/profile/social', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({linkedin: linkedin || null}),
      });
      setData(p =>
        p
          ? {
              ...p,
              documents: {...normDocs(p.documents), linkedin: linkedin || null},
            }
          : p,
      );
      showToast('Social information saved', 'success');
    } catch (e: any) {
      alert(e?.message || 'Failed to save Social');
    } finally {
      setSavingSocial(false);
    }
  }

  if (loading) return <main className="profile-container">Loading…</main>;
  if (!user) return <main className="profile-container">Please log in.</main>;
  const nameBase = `${data?.firstName || 'user'}_${data?.surname || ''}`.trim();
  return (
    <main className="profile-container">
      <Head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      <div className="profile-header">
        <h1 className="profile-title">My Profile</h1>
        <Link href="/change-password" className="change-password-btn">
          <i className="fas fa-lock icon-blue" />{' '}
          <span className="ml-8">Change password</span>
        </Link>
      </div>

      {err && (
        <div className="error-message">
          <i className="fas fa-exclamation-circle" />
          <span className="ml-8">{err}</span>
        </div>
      )}

      <div className="profile-grid">
        <aside className="profile-sidebar">
          <div className="avatar-container">
            <img
              src={avatarSrc}
              alt="Profile Avatar"
              className="avatar"
              onError={e => {
                const el = e.currentTarget;
                if (el.src !== DEFAULT_AVATAR) el.src = DEFAULT_AVATAR;
              }}
            />
          </div>

          <div>
            <h2 className="user-name">
              {data ? `${data.firstName} ${data.surname}` : '—'}
            </h2>
            <div className="user-role">{data?.role ?? '—'}</div>
          </div>

          {canEdit && (
            <div className="mt-16">
              {/* <label className="info-label" htmlFor="avatarFile">Update avatar</label> */}

              {/* Hidden native input */}
              <input
                id="avatarFile"
                type="file"
                accept="image/*"
                style={{display: 'none'}}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const dataUrl = await fileToDataURL(f);
                  setCropSrc(dataUrl);
                  setCropOpen(true);
                }}
              />

              {/* Nice button – no filename shown */}
              <label
                htmlFor="avatarFile"
                className="upload-btn"
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {upAvatar ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : (
                  <i className="fas fa-upload" />
                )}
                <span className="ml-8">
                  {data?.avatarUrl ? 'Replace photo' : 'Upload photo'}
                </span>
              </label>

              {upAvatar && <div className="hint">Uploading…</div>}
            </div>
          )}
        </aside>

        {cropSrc && (
          <AvatarCropper
            src={cropSrc}
            open={cropOpen}
            onClose={() => setCropOpen(false)}
            onCropped={blob =>
              uploadAvatarBlob(blob, 'avatar.webp', blob.type || 'image/webp')
            }
            circle
            size={512}
          />
        )}

        <section className="profile-content">
          <Card icon="fa-building" title="Company Information">
            <Info k="Company Email" v={data?.companyEmail} />
            <Info k="Department" v={data?.department} />
            <Info k="Position" v={data?.position} />
            <Info k="Supervisor" v={data?.supervisor} />
            <Info k="Status" v={data?.status} />
            <Info k="Start Date" v={fmtDate(data?.startDate)} />
            <Info k="End Date" v={fmtDate(data?.endDate)} />
          </Card>

          <Card icon="fa-user" title="Personal Information">
            <Info k="Personal Email" v={data?.personalEmail} />
            <Info k="Phone" v={data?.phone} />
            <Info k="Nationality" v={data?.nationality} />
            <Info k="Gender" v={data?.gender} />
            <Info k="Birthdate" v={fmtDate(data?.birthdate)} />
          </Card>

          <Card icon="fa-phone-alt" title="Emergency Contact (SOS)">
            {canEdit ? (
              <>
                <Field label="Relative Phone Number">
                  <input
                    value={sosPhone}
                    onChange={e => setSosPhone(e.target.value)}
                    placeholder="+123 456 789"
                  />
                </Field>
                <Field label="Relation with Intern">
                  <select
                    value={sosRelation}
                    onChange={e => setSosRelation(e.target.value)}
                  >
                    <option value="">—</option>
                    {[
                      'mother',
                      'father',
                      'sister',
                      'brother',
                      'grandfather',
                      'grandmother',
                      'spouse',
                      'uncle',
                      'aunt',
                      'friend',
                    ].map(v => (
                      <option key={v} value={v}>
                        {cap(v)}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  className="save-btn"
                  onClick={saveSOS}
                  disabled={savingSOS}
                >
                  <i
                    className={`fas ${savingSOS ? 'fa-spinner fa-spin' : 'fa-save'}`}
                  />
                  <span className="ml-8">
                    {savingSOS ? 'Saving…' : 'Save SOS Information'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <Info
                  k="Relative Phone Number"
                  v={data?.sos?.relativePhoneNumber || null}
                />
                <Info
                  k="Relation with Intern"
                  v={data?.sos?.relationWithIntern || null}
                />
              </>
            )}
          </Card>

          <Card icon="fa-share-alt" title="Social Information">
            {canEdit ? (
              <>
                <Field label="LinkedIn">
                  <input
                    value={linkedin}
                    onChange={e => setLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </Field>
                <button
                  className="save-btn"
                  onClick={saveSocial}
                  disabled={savingSocial}
                >
                  <i
                    className={`fas ${savingSocial ? 'fa-spinner fa-spin' : 'fa-save'}`}
                  />
                  <span className="ml-8">
                    {savingSocial ? 'Saving…' : 'Save Social Information'}
                  </span>
                </button>
              </>
            ) : (
              <Info k="LinkedIn" v={data?.documents?.linkedin || null} />
            )}
          </Card>

          <Card icon="fa-file-alt" title="Documents">
            <div className="doc-grid">
              <DocTile
                label="Acceptance Letter"
                value={data?.documents?.acceptanceLetter}
                kind="acceptance_letter"
                busy={false}
                onPick={() => {}}
                canEdit={false}
                nameBase={nameBase}
              />

              <DocTile
                label={agreementLabel(data?.empType)}
                value={data?.documents?.learningAgreement}
                kind="learning_agreement"
                busy={false}
                onPick={() => {}}
                canEdit={false}
                nameBase={nameBase}
              />

              <DocTile
                label="Passport ID"
                value={data?.documents?.passportId}
                kind="passport_id"
                busy={false}
                onPick={() => {}}
                canEdit={false}
                nameBase={nameBase}
                extra={
                  data?.documents?.passportExpiryDate ? (
                    <>
                      Expiry:{' '}
                      <b>
                        {String(data?.documents?.passportExpiryDate).slice(
                          0,
                          10,
                        )}
                      </b>
                    </>
                  ) : null
                }
              />

              <DocTile
                label="CV"
                value={data?.documents?.cv}
                kind="cv"
                busy={false}
                onPick={() => {}}
                canEdit={false}
                nameBase={nameBase}
              />
            </div>
          </Card>
        </section>
      </div>
      {toast && (
        <div
          className={`toast ${toast.kind === 'success' ? 'toast-success' : 'toast-error'}`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`fas ${toast.kind === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}`}
          />
          <span className="ml-8">{toast.message}</span>
        </div>
      )}
    </main>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h3 className="card-title">
        <i className={`fas ${icon} icon-blue`} /> {title}
      </h3>
      <div className="info-grid">{children}</div>
    </div>
  );
}

function Info({k, v}: {k: string; v?: string | null}) {
  return (
    <div className="info-item">
      <span className="info-label">{k}</span>
      <div className="info-value">
        {v && String(v).trim() ? v : <span className="empty">Not set</span>}
      </div>
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      {children}
    </div>
  );
}

function toProxy(url?: string | null) {
  if (!url) return null;
  const m = url.match(/[?&]id=([^&]+)/) || url.match(/\/file\/d\/([^/]+)/);
  return m ? `/api/uploads/drive/file/${m[1]}?name=document` : url;
}

function sanitizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '');
}
function extFromMime(m?: string | null) {
  if (!m) return 'bin';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return (m.split('/').pop() || 'bin').toLowerCase();
}

/** Auth’d download with a forced filename */
async function downloadWithAuth(url: string, nameBase: string, kind: string) {
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    alert('Download failed');
    return;
  }
  const blob = await res.blob();
  const mime = res.headers.get('Content-Type');
  const ext = extFromMime(mime);
  const filename = `${sanitizeName(nameBase)}_${sanitizeName(kind)}.${ext}`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename; // <-- forces the nice name
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function DocTile({
  label,
  value,
  kind,
  busy,
  onPick,
  canEdit,
  nameBase,
  extra,
}: {
  label: string;
  value: string | null | undefined;
  kind: 'acceptance_letter' | 'learning_agreement' | 'passport_id' | 'cv';
  busy: boolean;
  onPick: (file: File) => void;
  canEdit: boolean;
  nameBase: string;
  extra?: React.ReactNode;
}) {
  const id = `file-${kind}`;
  const proxied = toProxy(value);

  return (
    <div className="doc-tile">
      <div className="doc-left">
        <i className="fas fa-file icon-blue doc-icon" />
      </div>

      <div className="doc-mid">
        <div className="doc-label">{label}</div>
        <div className="doc-file">
          {proxied ? (
            <span className="ok" style={{color: '#16a34a', fontWeight: 600}}>
              Uploaded
            </span>
          ) : (
            <span className="empty">Not uploaded</span>
          )}
        </div>

        {extra && (
          <div style={{marginTop: 6, fontSize: 12, color: '#6b7280'}}>
            {extra}
          </div>
        )}

        {proxied && (
          <div className="doc-actions" style={{marginTop: 6}}>
            <button
              className="download-btn"
              onClick={() => downloadWithAuth(proxied, nameBase, kind)}
            >
              <i className="fas fa-download" />{' '}
              <span className="ml-6">Download</span>
            </button>
          </div>
        )}
      </div>

      <div className="doc-right">
        {canEdit && (
          <>
            <label htmlFor={id} className="upload-btn">
              {busy ? (
                <i className="fas fa-spinner fa-spin" />
              ) : (
                <i className="fas fa-upload" />
              )}
              <span className="ml-8">{value ? 'Replace' : 'Upload'}</span>
            </label>
            <input
              id={id}
              type="file"
              style={{display: 'none'}}
              accept={
                kind === 'passport_id'
                  ? 'image/*,application/pdf'
                  : 'application/pdf,image/*'
              }
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function fmtDate(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
}
function cap(s: string) {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
function basename(p: string) {
  try {
    return decodeURIComponent(p.split('/').pop() || p);
  } catch {
    return p;
  }
}
