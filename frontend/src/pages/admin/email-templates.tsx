// frontend/src/pages/admin/email-templates.tsx
import Head from 'next/head';
import {useEffect, useMemo, useState} from 'react';
import {useRouter} from 'next/router';
import {fetchWithAuth} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  LayoutTemplate,
  Palette,
  Search,
  Save,
  Eye,
  Send,
  RotateCcw,
  Code,
  FileText,
  Settings,
  Play,
  X,
  AlertCircle,
} from 'lucide-react';

// ... Types ...
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

// ... Helper ...
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

function EmailTemplatesContent() {
  const {user} = useAuth();
  const router = useRouter();

  // Sidebar state
  const [tab, setTab] = useState<'templates' | 'theme'>('templates');

  // Logic state
  const [theme, setTheme] = useState<EmailTheme | null>(null);
  const [themeDraft, setThemeDraft] = useState<Partial<EmailTheme>>({});

  const [headerTitle, setHeaderTitle] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter(
      t =>
        t.key.toLowerCase().includes(s) ||
        (t.description || '').toLowerCase().includes(s),
    );
  }, [templates, q]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);

  // Editor Tabs
  const [editorTab, setEditorTab] = useState<
    'settings' | 'html' | 'text' | 'test'
  >('settings');

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

  // ... Effects ...
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
      // auto-select first template if not selected
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
      const d: TemplateDetail = await apiJson(
        `/api/admin/email/templates/${encodeURIComponent(key)}`,
      );
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

  // ... Save Theme ...
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
      const updated = await apiJson('/api/admin/email/theme', {
        method: 'PUT',
        body: payload as any,
      });
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

  // ... Save Template ...
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
      await apiJson(
        `/api/admin/email/templates/${encodeURIComponent(selectedKey)}`,
        {
          method: 'PUT',
          body: payload as any,
        },
      );
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
      await apiJson(
        `/api/admin/email/templates/${encodeURIComponent(selectedKey)}`,
        {method: 'DELETE'},
      );
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
        {method: 'POST', body: {data} as any},
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
      await apiJson(
        `/api/admin/email/templates/${encodeURIComponent(selectedKey)}/test-send`,
        {
          method: 'POST',
          body: {to, data} as any,
        },
      );
      setMsg('Test email sent.');
    } catch (e: any) {
      setMsg(e?.message || 'Test send failed');
    } finally {
      setBusy(false);
    }
  }

  if (!user || user.role !== 'super_admin') return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-[#0a0a0a]">
      <Head>
        <title>Email Studio</title>
      </Head>

      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-[#111] border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Email Studio
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setTab('templates')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
              tab === 'templates'
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30 text-blue-900 dark:text-blue-100'
                : 'border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <LayoutTemplate
              size={20}
              className={
                tab === 'templates'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400'
              }
            />
            <span className="font-medium">Templates</span>
          </button>

          <button
            onClick={() => setTab('theme')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
              tab === 'theme'
                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30 text-blue-900 dark:text-blue-100'
                : 'border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <Palette
              size={20}
              className={
                tab === 'theme'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400'
              }
            />
            <span className="font-medium">Branding</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {/* Toast / Msg */}
        {msg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#111] text-white px-4 py-2.5 rounded-lg shadow-xl animate-fade-in flex items-center gap-3">
            <AlertCircle size={18} className="text-blue-400" />
            <span>{msg}</span>
            <button
              onClick={() => setMsg(null)}
              className="ml-2 text-gray-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {tab === 'templates' ? (
          <div className="grid grid-cols-12 gap-6 h-full p-6">
            {/* List Column */}
            <div className="col-span-3 flex flex-col h-full overflow-hidden">
              <div className="mb-4 relative shrink-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-lg py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {filtered.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedKey(t.key)}
                    className={`w-full text-left p-4 rounded-lg border transition-all group ${
                      selectedKey === t.key
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-[#111] border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className={`font-semibold text-sm ${selectedKey === t.key ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}`}
                      >
                        {t.key}
                      </span>
                      {t.enabled && (
                        <div
                          className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                          title="Enabled"
                        />
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {t.description || 'No description'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor Column */}
            <div className="col-span-9 flex flex-col h-full overflow-hidden bg-white dark:bg-[#111] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
              {detail ? (
                <>
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {detail.key}
                        <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                          {detail.source}
                        </span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={doPreview}
                        disabled={busy}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1A1A1A] hover:bg-gray-100 dark:hover:bg-[#222] rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                      >
                        <Eye size={16} /> Preview
                      </button>
                      <button
                        onClick={resetToDefault}
                        disabled={busy}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                      >
                        <RotateCcw size={16} /> Reset
                      </button>
                      <button
                        onClick={saveTemplate}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                      >
                        {busy ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Save size={16} />
                        )}
                        Save Changes
                      </button>
                    </div>
                  </div>

                  {/* Editor Tabs */}
                  <div className="px-6 pt-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
                    <div className="flex gap-6">
                      {[
                        {id: 'settings', label: 'Settings', icon: Settings},
                        {id: 'html', label: 'HTML Design', icon: Code},
                        {id: 'text', label: 'Text Version', icon: FileText},
                        {id: 'test', label: 'Test & Preview', icon: Play},
                      ].map(tabItem => (
                        <button
                          key={tabItem.id}
                          onClick={() => setEditorTab(tabItem.id as any)}
                          className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                            editorTab === tabItem.id
                              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          <tabItem.icon size={16} />
                          {tabItem.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Editor Content */}
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-[#0a0a0a]/50">
                    {editorTab === 'settings' && (
                      <div className="max-w-3xl space-y-6 animate-fade-in">
                        <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="font-medium text-gray-900 dark:text-white">
                              Enabled
                            </label>
                            <div
                              onClick={() => setEnabled(!enabled)}
                              className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                            >
                              <div
                                className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Subject Line
                            </label>
                            <input
                              value={subjectTemplate}
                              onChange={e => setSubjectTemplate(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg p-2.5 transition-all outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Description
                            </label>
                            <input
                              value={description}
                              onChange={e => setDescription(e.target.value)}
                              className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg p-2.5 transition-all outline-none"
                            />
                          </div>
                        </div>

                        <div className="bg-white dark:bg-[#111] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Palette size={16} /> Overrides
                          </h3>
                          <p className="text-xs text-gray-500">
                            Optional: Override global theme settings for this
                            specific email.
                          </p>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Header Title
                              </label>
                              <input
                                value={headerTitle}
                                onChange={e => setHeaderTitle(e.target.value)}
                                placeholder="Default"
                                className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg p-2.5 transition-all outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Logo URL
                              </label>
                              <input
                                value={logoUrl}
                                onChange={e => setLogoUrl(e.target.value)}
                                placeholder="Default"
                                className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg p-2.5 transition-all outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/20">
                          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2">
                            Available Variables
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {detail.variables.map(v => (
                              <code
                                key={v}
                                className="px-2 py-1 bg-white dark:bg-[#111] rounded border border-blue-200 dark:border-blue-800 text-xs font-mono text-blue-700 dark:text-blue-300"
                              >
                                {v}
                              </code>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {editorTab === 'html' && (
                      <div className="h-full flex flex-col animate-fade-in">
                        <textarea
                          value={htmlTemplate}
                          onChange={e => setHtmlTemplate(e.target.value)}
                          className="flex-1 w-full bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 ring-blue-500/20 resize-none"
                          spellCheck={false}
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          Use <code>{'{{var}}'}</code> for escaped output,{' '}
                          <code>{'{{{var}}}'}</code> for raw HTML.
                        </p>
                      </div>
                    )}

                    {editorTab === 'text' && (
                      <div className="h-full flex flex-col animate-fade-in">
                        <textarea
                          value={textTemplate}
                          onChange={e => setTextTemplate(e.target.value)}
                          className="flex-1 w-full bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 ring-blue-500/20 resize-none"
                          placeholder="Plain text version (optional)..."
                        />
                      </div>
                    )}

                    {editorTab === 'test' && (
                      <div className="grid grid-cols-2 gap-6 h-full animate-fade-in">
                        <div className="flex flex-col gap-4 overflow-hidden">
                          <div className="flex-1 flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Sample Data (JSON)
                            </label>
                            <textarea
                              value={sampleJson}
                              onChange={e => setSampleJson(e.target.value)}
                              className="flex-1 w-full bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl p-4 font-mono text-sm outline-none focus:ring-2 ring-blue-500/20 resize-none"
                              spellCheck={false}
                            />
                          </div>
                          <div className="bg-white dark:bg-[#111] p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3 shrink-0">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Send Test Email
                            </label>
                            <div className="flex gap-2">
                              <input
                                value={testTo}
                                onChange={e => setTestTo(e.target.value)}
                                placeholder="recipient@example.com"
                                className="flex-1 bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                              />
                              <button
                                onClick={testSend}
                                disabled={busy}
                                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
                          <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1A1A1A] flex justify-between items-center">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Live Preview
                            </span>
                            <button
                              onClick={doPreview}
                              className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                            >
                              Refresh
                            </button>
                          </div>
                          {preview?.html ? (
                            <iframe
                              title="Preview"
                              srcDoc={preview.html}
                              className="flex-1 w-full bg-white"
                              sandbox="allow-same-origin"
                            />
                          ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                              Click "Preview" to generate
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Select a template to start editing
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Branding View */
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Branding Settings
                </h2>
                <p className="text-gray-500 mt-2">
                  Customize the look and feel of all system emails.
                </p>
              </div>

              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
                <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Brand Color
                    </label>
                    <div className="flex gap-3">
                      <div
                        className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm shrink-0"
                        style={{
                          backgroundColor: themeDraft.brandColor || '#4a6cf7',
                        }}
                      />
                      <input
                        value={
                          themeDraft.brandColor ??
                          theme?.brandColor ??
                          '#4a6cf7'
                        }
                        onChange={e =>
                          setThemeDraft(s => ({
                            ...s,
                            brandColor: e.target.value,
                          }))
                        }
                        className="flex-1 bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Header Title
                      </label>
                      <input
                        value={themeDraft.headerTitle ?? ''}
                        onChange={e =>
                          setThemeDraft(s => ({
                            ...s,
                            headerTitle: e.target.value,
                          }))
                        }
                        placeholder="My Company"
                        className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Button Color
                      </label>
                      <input
                        value={themeDraft.buttonColor ?? ''}
                        onChange={e =>
                          setThemeDraft(s => ({
                            ...s,
                            buttonColor: e.target.value,
                          }))
                        }
                        placeholder="Same as Brand"
                        className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Logo URL
                    </label>
                    <input
                      value={themeDraft.logoUrl ?? ''}
                      onChange={e =>
                        setThemeDraft(s => ({...s, logoUrl: e.target.value}))
                      }
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Footer Text
                    </label>
                    <textarea
                      value={themeDraft.footerText ?? ''}
                      onChange={e =>
                        setThemeDraft(s => ({...s, footerText: e.target.value}))
                      }
                      rows={3}
                      placeholder="© 2024 My Company, Inc."
                      className="w-full bg-gray-50 dark:bg-[#1A1A1A] border-transparent focus:bg-white dark:focus:bg-[#111] focus:ring-2 ring-blue-500/20 rounded-lg px-3 py-2 outline-none transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                  <button
                    onClick={saveTheme}
                    disabled={busy}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {busy ? 'Saving...' : 'Save Theme Settings'}
                  </button>
                </div>
              </div>

              {/* Minimal Preview Card */}
              <div className="bg-gray-100 dark:bg-[#1a1a1a] p-8 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-center">
                <div className="w-[400px] bg-white rounded-lg shadow-xl overflow-hidden">
                  <div
                    className="h-2"
                    style={{
                      backgroundColor: themeDraft.brandColor || '#4a6cf7',
                    }}
                  />
                  <div className="p-8 text-center border-b border-gray-100">
                    {themeDraft.logoUrl ? (
                      <img
                        src={themeDraft.logoUrl}
                        alt="Logo"
                        className="h-8 mx-auto"
                      />
                    ) : (
                      <div className="text-xl font-bold text-gray-800">
                        {themeDraft.headerTitle || 'Header Title'}
                      </div>
                    )}
                  </div>
                  <div className="p-8 text-gray-600 text-sm leading-relaxed">
                    <p className="mb-4">
                      This is how your emails will generally look. We use a
                      clean, modern layout centered on readability.
                    </p>
                    <div
                      className="inline-block px-6 py-2.5 rounded text-white font-medium text-sm"
                      style={{
                        backgroundColor:
                          themeDraft.buttonColor ||
                          themeDraft.brandColor ||
                          '#4a6cf7',
                      }}
                    >
                      Call to Action
                    </div>
                  </div>
                  <div className="bg-gray-50 p-6 text-center text-xs text-gray-400">
                    {themeDraft.footerText || 'Company Address • Unsubscribe'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function EmailTemplatesPage() {
  return (
    <ProtectedRoute>
      <EmailTemplatesContent />
    </ProtectedRoute>
  );
}
