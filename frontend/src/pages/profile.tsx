// frontend/src/pages/profile.tsx
import {useEffect, useRef, useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import AvatarCropper from '@/components/AvatarCropper';
import {
  User,
  Building,
  Phone,
  Share2,
  FileText,
  Lock,
  Upload,
  Save,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Briefcase,
  Mail,
  Calendar,
  Globe,
  Download,
  AlertCircle,
  Camera,
} from 'lucide-react';

const toProxy = (url: string | null | undefined) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}${url}`;
};

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

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  if (!user)
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        <Link href="/login" className="text-blue-600 hover:underline mr-1">
          Login
        </Link>
        required.
      </div>
    );

  const nameBase = `${data?.firstName || 'user'}_${data?.surname || ''}`.trim();

  return (
    <main className="max-w-7xl mx-auto p-6 my-8 font-sans">
      <Head>
        <title>My Profile</title>
      </Head>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            My Profile
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your personal information and documents
          </p>
        </div>
        <Link
          href="/change-password"
          className="flex items-center gap-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-sm"
        >
          <Lock size={16} /> Change Password
        </Link>
      </div>

      {err && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-xl mb-8 flex items-center gap-3 border border-red-100 dark:border-red-800">
          <AlertTriangle size={20} />
          <span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
        {/* Left Column: Avatar & Quick Info */}
        <aside className="space-y-6">
          <div className="bg-white dark:bg-[#111] rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-600 to-blue-400 opacity-10"></div>
            <div className="relative">
              <div className="w-32 h-32 mx-auto rounded-full p-1 bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 shadow-sm mb-4 relative group">
                <img
                  src={avatarSrc}
                  alt="Profile Avatar"
                  className="w-full h-full rounded-full object-cover"
                  onError={e => {
                    const el = e.currentTarget;
                    if (el.src !== DEFAULT_AVATAR) el.src = DEFAULT_AVATAR;
                  }}
                />
                {canEdit && (
                  <label
                    htmlFor="avatarFile"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                  >
                    <Camera size={24} />
                    <input
                      id="avatarFile"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const dataUrl = await fileToDataURL(f);
                        setCropSrc(dataUrl);
                        setCropOpen(true);
                      }}
                    />
                  </label>
                )}
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {data ? `${data.firstName} ${data.surname}` : '—'}
              </h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold uppercase tracking-wide">
                <Briefcase size={12} />
                {data?.role ?? 'User'}
              </div>

              {upAvatar && (
                <div className="mt-4 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse flex items-center justify-center gap-1">
                  <Upload size={12} /> Uploading...
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-[#111] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2">
              <Building size={16} className="text-gray-400" /> Work Info
            </h3>
            <div className="space-y-4">
              <InfoItem
                icon={<Mail size={16} />}
                label="Email"
                value={data?.companyEmail}
              />
              <InfoItem
                icon={<Building size={16} />}
                label="Department"
                value={data?.department}
              />
              <InfoItem
                icon={<Briefcase size={16} />}
                label="Position"
                value={data?.position}
              />
              <InfoItem
                icon={<User size={16} />}
                label="Supervisor"
                value={data?.supervisor}
              />
              <InfoItem
                icon={<Calendar size={16} />}
                label="Start Date"
                value={fmtDate(data?.startDate)}
              />
            </div>
          </div>
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

        {/* Right Column: Details & Forms */}
        <div className="space-y-8">
          {/* Personal Info */}
          <section className="bg-white dark:bg-[#111] rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <User className="text-blue-600 dark:text-blue-400" size={20} />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoBox
                label="Personal Email"
                value={data?.personalEmail}
                icon={<Mail size={16} />}
              />
              <InfoBox
                label="Phone"
                value={data?.phone}
                icon={<Phone size={16} />}
              />
              <InfoBox
                label="Nationality"
                value={data?.nationality}
                icon={<Globe size={16} />}
              />
              <InfoBox
                label="Gender"
                value={data?.gender}
                icon={<User size={16} />}
              />
              <InfoBox
                label="Birthdate"
                value={fmtDate(data?.birthdate)}
                icon={<Calendar size={16} />}
              />
            </div>
          </section>

          {/* SOS Contact */}
          <section className="bg-white dark:bg-[#111] rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <AlertCircle
                className="text-red-600 dark:text-red-400"
                size={20}
              />
              Emergency Contact
            </h3>
            {canEdit ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Relative Phone Number
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={sosPhone}
                      onChange={e => setSosPhone(e.target.value)}
                      placeholder="+123 456 789"
                      className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Relation
                  </label>
                  <select
  value={sosRelation}
  onChange={e => setSosRelation(e.target.value)}
  className="w-full p-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
>
  <option value="">— Select —</option>
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
                </div>
                <div className="md:col-span-2">
                  <button
                    onClick={saveSOS}
                    disabled={savingSOS}
                    className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingSOS ? (
                      <Upload size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    {savingSOS ? 'Saving...' : 'Save Emergency Info'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InfoBox
                  label="Relative Phone"
                  value={data?.sos?.relativePhoneNumber}
                  icon={<Phone size={16} />}
                />
                <InfoBox
                  label="Relation"
                  value={data?.sos?.relationWithIntern}
                  icon={<User size={16} />}
                />
              </div>
            )}
          </section>

          {/* Social */}
          <section className="bg-white dark:bg-[#111] rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <Share2 className="text-blue-600 dark:text-blue-400" size={20} />
              Social
            </h3>
            {canEdit ? (
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    LinkedIn Profile
                  </label>
                  <div className="relative">
                    <ExternalLink
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={linkedin}
                      onChange={e => setLinkedin(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={saveSocial}
                  disabled={savingSocial}
                  className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto justify-center"
                >
                  {savingSocial ? (
                    <Upload size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {savingSocial ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : (
              <InfoBox
                label="LinkedIn"
                value={data?.documents?.linkedin}
                icon={<ExternalLink size={16} />}
              />
            )}
          </section>

          {/* Documents */}
          <section className="bg-white dark:bg-[#111] rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <FileText
                className="text-blue-600 dark:text-blue-400"
                size={20}
              />
              Documents
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertCircle size={12} />
                      Expires:{' '}
                      <span className="font-medium">
                        {String(data?.documents?.passportExpiryDate).slice(
                          0,
                          10,
                        )}
                      </span>
                    </div>
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
          </section>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-xl shadow-xl z-50 text-sm font-medium animate-[fadeInUp_0.3s_ease-out] flex items-center gap-2">
          <CheckCircle
            size={16}
            className="text-green-400 dark:text-green-600"
          />
          {toast.message}
        </div>
      )}
    </main>
  );
}

// Subcomponents

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
      <div className="text-gray-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {value || '—'}
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex items-start gap-3">
      <div className="p-2 bg-white dark:bg-[#222] rounded-lg shadow-sm text-gray-500 dark:text-gray-400">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
          {label}
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-white break-all">
          {value || 'Not set'}
        </div>
      </div>
    </div>
  );
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
    <div className="bg-gray-50 dark:bg-[#1A1A1A] p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between group hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`p-2.5 rounded-lg ${
            proxied
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <FileText size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {label}
          </div>
          <div className="flex flex-col">
            <span
              className={`text-xs font-medium ${
                proxied ? 'text-green-600 dark:text-green-400' : 'text-gray-500'
              }`}
            >
              {proxied ? 'Uploaded' : 'Missing'}
            </span>
            {extra}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {proxied && (
          <button
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            onClick={() => downloadWithAuth(proxied, nameBase, kind)}
            title="Download"
          >
            <Download size={18} />
          </button>
        )}

        {canEdit && (
          <>
            <label
              htmlFor={id}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors cursor-pointer"
              title={value ? 'Replace' : 'Upload'}
            >
              {busy ? (
                <Upload size={18} className="animate-spin" />
              ) : (
                <Upload size={18} />
              )}
            </label>
            <input
              id={id}
              type="file"
              className="hidden"
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
