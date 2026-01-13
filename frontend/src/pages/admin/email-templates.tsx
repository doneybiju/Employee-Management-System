// frontend/src/pages/admin/email-templates.tsx
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type EmailTheme = {
  id: number;
  brandColor: string;
  headerTitle: string | null;
  logoUrl: string | null;
  buttonColor: string | null;
  footerText: string | null;
  updatedAt: string;
  updatedBy: number | null;
};

type TemplateSummary = {
  key: string;
  description: string;
  enabled: boolean;
  source: 'default' | 'custom';
  updatedAt: string | null;
};

type TemplateDetail = {
  source: 'default' | 'custom';
  key: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  enabled: boolean;
  description: string | null;
  variables: string[];
  sampleData: Record<string, any>;

  headerTitle?: string | null;
  logoUrl?: string | null;

};

type PreviewResponse = {
  key: string;
  subject: string;
  html: string;
  text?: string | null;
  dataUsed?: any;
};

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetchWithAuth(path, init);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || text || res.statusText);
  }
  return data;
}

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<'templates' | 'theme'>('templates');

  const [theme, setTheme] = useState<EmailTheme | null>(null);
  const [themeDraft, setThemeDraft] = useState<Partial<EmailTheme>>({});

  const [headerTitle, setHeaderTitle] = useState('');
  const [logoUrl, setLogoUrl] = useState('');


  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter(t =>
      t.key.toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s)
    );
  }, [templates, q]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);

  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState('');
  const [htmlTemplate, setHtmlTemplate] = useState('');
  const [textTemplate, setTextTemplate] = useState('');
  const [sampleJson, setSampleJson] = useState('{}');

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [testTo, setTestTo] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Guard: only super_admin should see/use this page
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') router.replace('/admin');
  }, [user, router]);

  async function loadAll() {
    setBusy(true);
    setMsg(null);
    try {
      const [t, list] = await Promise.all([
        apiJson('/api/admin/email/theme'),
        apiJson('/api/admin/email/templates'),
      ]);
      setTheme(t);
      setThemeDraft(t);
      setTemplates(list);
      // auto-select first template
      if (!selectedKey && Array.isArray(list) && list.length) {
        setSelectedKey(list[0].key);
      }
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load');
    } finally {
      setBusy(false);
    }
  }

  async function loadTemplate(key: string) {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    try {
      const d: TemplateDetail = await apiJson(`/api/admin/email/templates/${encodeURIComponent(key)}`);
      setDetail(d);

      setSubjectTemplate(d.subjectTemplate || '');
      setEnabled(!!d.enabled);
      setDescription(d.description || '');

      setHeaderTitle((d as any).headerTitle || '');
      setLogoUrl((d as any).logoUrl || '');


      setHtmlTemplate(d.htmlTemplate || '');
      setTextTemplate(d.textTemplate || '');
      setSampleJson(JSON.stringify(d.sampleData || {}, null, 2));
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load template');
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || user.role !== 'super_admin') return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    if (!selectedKey) return;
    if (!user || user.role !== 'super_admin') return;
    loadTemplate(selectedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  async function saveTheme() {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        brandColor: (themeDraft.brandColor ?? '') || '#4a6cf7',
        headerTitle: themeDraft.headerTitle ?? null,
        logoUrl: themeDraft.logoUrl ?? null,
        buttonColor: themeDraft.buttonColor ?? null,
        footerText: themeDraft.footerText ?? null,
      };
      const updated = await apiJson('/api/admin/email/theme', { method: 'PUT', body: payload as any });
      setTheme(updated);
      setThemeDraft(updated);
      setMsg('Theme saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save theme');
    } finally {
      setBusy(false);
    }
  }

  function parseSample(): Record<string, any> {
    try {
      const obj = JSON.parse(sampleJson || '{}');
      if (!obj || typeof obj !== 'object') return {};
      return obj;
    } catch {
      throw new Error('Sample Data JSON is invalid.');
    }
  }

  async function saveTemplate() {
    if (!selectedKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const sampleData = parseSample();
      const payload = {
        subjectTemplate,
        htmlTemplate,
        textTemplate: textTemplate.trim() ? textTemplate : null,
        enabled,
        description: description.trim() ? description.trim() : null,

        headerTitle: headerTitle.trim() ? headerTitle.trim() : null,
        logoUrl: logoUrl.trim() ? logoUrl.trim() : null,

        variables: detail?.variables || [],
        sampleData,
      };
      await apiJson(`/api/admin/email/templates/${encodeURIComponent(selectedKey)}`, {
        method: 'PUT',
        body: payload as any,
      });
      setMsg('Template saved.');
      await loadAll();
      await loadTemplate(selectedKey);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save template');
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    if (!selectedKey) return;
    if (!confirm(`Reset "${selectedKey}" to default?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiJson(`/api/admin/email/templates/${encodeURIComponent(selectedKey)}`, { method: 'DELETE' });
      setMsg('Reset to default.');
      await loadAll();
      await loadTemplate(selectedKey);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to reset');
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    if (!selectedKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const data = parseSample();
      const out: PreviewResponse = await apiJson(
        `/api/admin/email/templates/${encodeURIComponent(selectedKey)}/preview`,
        { method: 'POST', body: { data } as any }
      );
      setPreview(out);
    } catch (e: any) {
      setMsg(e?.message || 'Preview failed');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    if (!selectedKey) return;
    const to = testTo.trim();
    if (!to) {
      setMsg('Enter a recipient email in "Test send to".');
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const data = parseSample();
      await apiJson(`/api/admin/email/templates/${encodeURIComponent(selectedKey)}/test-send`, {
        method: 'POST',
        body: { to, data } as any,
      });
      setMsg('Test email sent.');
    } catch (e: any) {
      setMsg(e?.message || 'Test send failed');
    } finally {
      setBusy(false);
    }
  }

  if (!user || user.role !== 'super_admin') return null;

  return (
    <>
      <Head><title>Email Templates</title></Head>

      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Email Templates</h1>
          <button
            onClick={loadAll}
            disabled={busy}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}
          >
            Refresh
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => setTab('templates')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: tab === 'templates' ? '#111827' : '#fff',
                color: tab === 'templates' ? '#fff' : '#111827',
              }}
            >
              Templates
            </button>
            <button
              onClick={() => setTab('theme')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: tab === 'theme' ? '#111827' : '#fff',
                color: tab === 'theme' ? '#fff' : '#111827',
              }}
            >
              Theme
            </button>
          </div>
        </div>

        {msg ? (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}>
            {msg}
          </div>
        ) : null}

        {tab === 'theme' ? (
          <div style={{ maxWidth: 860, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Email Theme</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'center' }}>
              <label>Header Title</label>
              <input
                value={themeDraft.headerTitle ?? ''}
                onChange={e => setThemeDraft(s => ({ ...s, headerTitle: e.target.value }))}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />

              <label>Brand Color</label>
              <input
                value={themeDraft.brandColor ?? theme?.brandColor ?? '#4a6cf7'}
                onChange={e => setThemeDraft(s => ({ ...s, brandColor: e.target.value }))}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />

              <label>Button Color (optional)</label>
              <input
                value={themeDraft.buttonColor ?? ''}
                onChange={e => setThemeDraft(s => ({ ...s, buttonColor: e.target.value }))}
                placeholder="Leave blank to use Brand Color"
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />

              <label>Logo URL (optional)</label>
              <input
                value={themeDraft.logoUrl ?? ''}
                onChange={e => setThemeDraft(s => ({ ...s, logoUrl: e.target.value }))}
                placeholder="https://..."
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />

              <label>Footer Text (optional)</label>
              <textarea
                value={themeDraft.footerText ?? ''}
                onChange={e => setThemeDraft(s => ({ ...s, footerText: e.target.value }))}
                rows={3}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={saveTheme}
                disabled={busy}
                style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600 }}
              >
                Save Theme
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 }}>
            {/* left list */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search templates..."
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedKey(t.key)}
                    style={{
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: selectedKey === t.key ? '#111827' : '#fff',
                      color: selectedKey === t.key ? '#fff' : '#111827',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.key}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{t.description}</div>
                    <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                      {t.enabled ? 'Enabled' : 'Disabled'} · {t.source}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* right editor */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              {!detail ? (
                <div style={{ padding: 10 }}>Select a template.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>{detail.key}</h2>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      Source: <b>{detail.source}</b>
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
                      Vars: {detail.variables.join(', ') || '—'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, marginTop: 12, alignItems: 'center' }}>
                    <label style={{ fontSize: 13 }}>Enabled</label>
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />

                    <label style={{ fontSize: 13 }}>Description</label>
                    <input
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                    />

                    <label style={{ fontSize: 13 }}>Subject</label>
                    <input
                      value={subjectTemplate}
                      onChange={e => setSubjectTemplate(e.target.value)}
                      style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                    />

                    <label style={{ fontSize: 13 }}>Header Title (override)</label>
                    <input
                        value={headerTitle}
                        onChange={e => setHeaderTitle(e.target.value)}
                        placeholder="Leave blank to use Theme header title"
                        style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                    />

                    <label style={{ fontSize: 13 }}>Logo URL (override)</label>
                    <input
                        value={logoUrl}
                        onChange={e => setLogoUrl(e.target.value)}
                        placeholder="Leave blank to use Theme logo"
                        style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                    />  
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>HTML Body (template)</div>
                    <textarea
                      value={htmlTemplate}
                      onChange={e => setHtmlTemplate(e.target.value)}
                      rows={12}
                      style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                    />
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                      Use <code>{'{{var}}'}</code> for escaped values and <code>{'{{{var}}}'}</code> for raw HTML inserts.
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Text Body (optional)</div>
                    <textarea
                      value={textTemplate}
                      onChange={e => setTextTemplate(e.target.value)}
                      rows={6}
                      style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Sample Data (JSON)</div>
                    <textarea
                      value={sampleJson}
                      onChange={e => setSampleJson(e.target.value)}
                      rows={8}
                      style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    <button
                      onClick={saveTemplate}
                      disabled={busy}
                      style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600 }}
                    >
                      Save
                    </button>

                    <button
                      onClick={resetToDefault}
                      disabled={busy}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}
                    >
                      Reset to Default
                    </button>

                    <button
                      onClick={doPreview}
                      disabled={busy}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' }}
                    >
                      Preview
                    </button>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={testTo}
                        onChange={e => setTestTo(e.target.value)}
                        placeholder="Test send to (email)"
                        style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', minWidth: 260 }}
                      />
                      <button
                        onClick={testSend}
                        disabled={busy}
                        style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontWeight: 600 }}
                      >
                        Send
                      </button>
                    </div>
                  </div>

                  {preview?.html ? (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Preview</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Subject: <b>{preview.subject}</b>
                        </div>
                      </div>
                      <iframe
                        title="Email preview"
                        srcDoc={preview.html}
                        style={{ width: '100%', height: 520, border: '1px solid #e5e7eb', borderRadius: 12 }}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
