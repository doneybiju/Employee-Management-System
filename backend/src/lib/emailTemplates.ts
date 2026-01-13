// backend/src/lib/emailTemplates.ts
import prisma from '../prisma';

const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Keep this list tight so your DB can't be polluted with random keys.
 * You can add more keys later.
 */
export const ALLOWED_EMAIL_TEMPLATE_KEYS = [
  'welcome_credentials',
  'project_member_added',
  'project_status_changed',
  'project_member_removed',
  'project_deleted',
  'request_approved',
  'request_rejected',
  'forgot_password',
  'setup_password',
  'missing_documents_reminder',
  'doc_expiry_reminder',
  'access_revoked',
  'access_restored',
] as const;


export type EmailTemplateKey = (typeof ALLOWED_EMAIL_TEMPLATE_KEYS)[number];

export type EmailThemePatch = Partial<{
  brandColor: string;
  headerTitle: string | null;
  logoUrl: string | null;
  buttonColor: string | null;
  footerText: string | null;
}>;

export type EmailTemplatePatch = Partial<{
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  enabled: boolean;
  description: string | null;
  headerTitle: string | null;
  logoUrl: string | null;

  variables: any;
  sampleData: any;
}>;

type DefaultTemplate = {
  key: EmailTemplateKey;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string; // body HTML (NOT full page)
  textTemplate?: string | null;
  variables: string[];
  sampleData: Record<string, any>;
};

// Minimal, theme-wrapped layout (used for preview and later for sending)
function wrapWithTheme(opts: {
  bodyHtml: string;
  theme: {
    brandColor: string;
    headerTitle: string | null;
    logoUrl: string | null;
    buttonColor: string | null;
    footerText: string | null;
  };
}) {
  const { bodyHtml, theme } = opts;
  const headerTitle = theme.headerTitle || 'AdminLink';
  const brand = theme.brandColor || '#4a6cf7';
  const btn = theme.buttonColor || brand;

  const logoHtml = theme.logoUrl
    ? `<img src="${escapeAttr(theme.logoUrl)}" alt="Logo" style="max-width:180px;margin:0 auto 12px;display:block" />`
    : '';

  const footer = theme.footerText ? escapeHtml(theme.footerText) : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(headerTitle)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#f7f9fc;margin:0;padding:20px}
    .email-container{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
    .header{background:${brand};padding:26px 20px;text-align:center;color:#fff}
    .header h1{margin:0;font-size:22px;font-weight:700}
    .content{padding:22px 22px 8px;color:#111827;font-size:14px;line-height:1.45}
    .footer{text-align:center;padding:16px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb}
    .button{display:inline-block;background:${btn};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}
    .box{border:1px solid #e5e7eb;border-radius:10px;padding:14px;background:#fafafa}
    .muted{color:#6b7280}
    .kv{margin:10px 0}
    .k{font-weight:700;color:#2563eb;font-size:12px}
    .v{padding:10px 12px;border:1px solid #dbeafe;border-radius:8px;background:#fff;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${logoHtml}
      <h1>${escapeHtml(headerTitle)}</h1>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    ${footer ? `<div class="footer">${footer}</div>` : ''}
  </div>
</body>
</html>`;
}

function assertKey(key: string): EmailTemplateKey {
  if (!(ALLOWED_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key)) {
    throw new Error('invalid_template_key');
  }
  return key as EmailTemplateKey;
}

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: any) {
  // keep it simple (used in src="")
  return escapeHtml(s).replace(/`/g, '&#96;');
}

function renderVars(tpl: string, data: Record<string, any>, mode: 'html' | 'text') {
  let out = String(tpl ?? '');

  // raw (no escaping) with triple braces: {{{var}}}
  out = out.replace(/\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}/g, (_m, v) => String(data?.[v] ?? ''));

  // normal escaped: {{var}}
  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, v) => {
    const val = data?.[v];
    if (mode === 'text') return String(val ?? '');
    return escapeHtml(val);
  });

  return out;
}

const DEFAULTS: Record<EmailTemplateKey, DefaultTemplate> = {
  welcome_credentials: {
    key: 'welcome_credentials',
    description: 'Welcome email with portal credentials.',
    subjectTemplate: 'Welcome to Extramus — your account details',
    variables: ['recipientName', 'companyEmail', 'googlePasswordLine', 'sitePassword', 'portalUrl'],
    sampleData: {
      recipientName: 'New User',
      companyEmail: 'new.user@extramus.eu',
      googlePasswordLine: 'BVZLm*Wthm2Z',
      sitePassword: 'uRXnteJPpf$c',
      portalUrl: `${origin}/`,
    },
    htmlTemplate: `
      <p>Dear {{recipientName}},</p>
      <p>Welcome to the team! Below are your credentials. Please keep this information secure.</p>

      <div class="box">
        <div class="kv">
          <div class="k">Company Email</div>
          <div class="v">{{companyEmail}}</div>
        </div>

        <div class="kv">
          <div class="k">GMAIL Password</div>
          <div class="v">{{googlePasswordLine}}</div>
        </div>

        <div class="kv">
          <div class="k">Website Password</div>
          <div class="v">{{sitePassword}}</div>
        </div>
      </div>

      <p class="muted"><strong>Important:</strong> Your website login email is the same as your company email address.</p>
      <p><a class="button" href="{{portalUrl}}">Access Your Portal</a></p>
    `,
  },

  project_member_added: {
    key: 'project_member_added',
    description: 'Sent when a user is added to a project.',
    subjectTemplate: 'You were added to project: {{projectTitle}}',
    variables: ['projectTitle', 'projectUrl', 'teamList'],
    sampleData: {
      projectTitle: 'Website Redesign',
      projectUrl: `${origin}/projects/123`,
      teamList: 'Alice, Bob, Charlie',
    },
    htmlTemplate: `
      <h2 style="margin:0 0 8px">Project assigned: {{projectTitle}}</h2>
      <p>You have been added to this project.</p>
      <p><strong>Team members:</strong> {{teamList}}</p>
      <p><a href="{{projectUrl}}">Open project</a></p>
    `,
  },

  project_status_changed: {
    key: 'project_status_changed',
    description: 'Sent when a project status changes.',
    subjectTemplate: 'Project status updated: {{projectTitle}} → {{newStatus}}',
    variables: ['projectTitle', 'projectUrl', 'newStatus'],
    sampleData: {
      projectTitle: 'Website Redesign',
      projectUrl: `${origin}/projects/123`,
      newStatus: 'IN PROGRESS',
    },
    htmlTemplate: `
      <h2 style="margin:0 0 8px">Status changed</h2>
      <p><strong>{{projectTitle}}</strong> is now <strong>{{newStatus}}</strong>.</p>
      <p><a href="{{projectUrl}}">Open project</a></p>
    `,
  },

  project_member_removed: {
    key: 'project_member_removed',
    description: 'Sent when a user is removed from a project.',
    subjectTemplate: 'Removed from project: {{projectTitle}}',
    variables: ['projectTitle', 'projectUrl'],
    sampleData: {
      projectTitle: 'Website Redesign',
      projectUrl: `${origin}/projects/123`,
    },
    htmlTemplate: `
      <h2 style="margin:0 0 8px">Access removed</h2>
      <p>You were removed from <strong>{{projectTitle}}</strong>.</p>
      <p><a href="{{projectUrl}}">Project link</a> (may no longer be accessible)</p>
    `,
  },

  project_deleted: {
    key: 'project_deleted',
    description: 'Sent when a project is deleted.',
    subjectTemplate: 'Project deleted: {{projectTitle}}',
    variables: ['projectTitle', 'deletedByName', 'projectsUrl'],
    sampleData: {
      projectTitle: 'Website Redesign',
      deletedByName: 'Admin',
      projectsUrl: `${origin}/projects`,
    },
    htmlTemplate: `
      <p>The project <strong>{{projectTitle}}</strong> was deleted by <strong>{{deletedByName}}</strong>.</p>
      <p>You can view your remaining projects here:</p>
      <p><a class="button" href="{{projectsUrl}}">Open Projects</a></p>
      <p class="muted">If you believe this was a mistake, contact HR.</p>
    `,
    textTemplate: `
Project deleted: {{projectTitle}}

The project "{{projectTitle}}" was deleted by {{deletedByName}}.

Open Projects: {{projectsUrl}}

If you believe this was a mistake, contact HR.
    `.trim(),
  },


  request_approved: {
    key: 'request_approved',
    description: 'Sent when an employee request is approved.',
    subjectTemplate: '{{kindLabel}} request – Approved',
    variables: ['recipientName', 'kindLabel', 'dateLabel', 'windowLabel', 'reasonLine', 'noteLine', 'approvedBy'],
    sampleData: {
      recipientName: 'Test',
      kindLabel: 'Extra hours',
      dateLabel: '2025-01-10',
      windowLabel: '15:00–17:00',
      reasonLine: '',
      noteLine: '',
      approvedBy: 'HR',
    },
    // In Phase 3 we can switch it to HTML if you want. For now keep text.
    htmlTemplate: `
      <pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif">
Hello {{recipientName}},

Your {{kindLabel}} request has been APPROVED.

Details:
  Date(s): {{dateLabel}}
  Window: {{windowLabel}}
  {{reasonLine}}
  {{noteLine}}

— {{approvedBy}}
      </pre>
    `,
  },

  request_rejected: {
    key: 'request_rejected',
    description: 'Sent when an employee request is rejected.',
    subjectTemplate: '{{kindLabel}} request – Rejected',
    variables: ['recipientName', 'kindLabel', 'dateLabel', 'windowLabel', 'reasonLine', 'noteLine', 'approvedBy'],
    sampleData: {
      recipientName: 'Test',
      kindLabel: 'Absence',
      dateLabel: '2025-01-10 → 2025-01-12',
      windowLabel: '',
      reasonLine: 'Reason: Sick',
      noteLine: 'Note: Please re-submit with correct dates',
      approvedBy: 'HR',
    },
    htmlTemplate: `
      <pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif">
Hello {{recipientName}},

Your {{kindLabel}} request has been REJECTED.

Details:
  Date(s): {{dateLabel}}
  Window: {{windowLabel}}
  {{reasonLine}}
  {{noteLine}}

— {{approvedBy}}
      </pre>
    `,
  },

  forgot_password: {
    key: 'forgot_password',
    description: 'Password reset email (placeholder for now).',
    subjectTemplate: 'Reset your password',
    variables: ['resetUrl', 'recipientName'],
    sampleData: { recipientName: 'User', resetUrl: `${origin}/reset?token=xxx` },
    htmlTemplate: `
      <p>Hello {{recipientName}},</p>
      <p>Use the link below to reset your password:</p>
      <p><a class="button" href="{{resetUrl}}">Reset password</a></p>
      <p class="muted">If you didn’t request this, you can ignore this email.</p>
    `,
  },

  doc_expiry_reminder: {
    key: 'doc_expiry_reminder',
    description: 'Document expiry reminder (placeholder for now).',
    subjectTemplate: 'Document expiry reminder: {{documentType}}',
    variables: ['recipientName', 'documentType', 'expiresOn', 'portalUrl'],
    sampleData: {
      recipientName: 'User',
      documentType: 'Passport',
      expiresOn: '2026-02-01',
      portalUrl: `${origin}/profile`,
    },
    htmlTemplate: `
      <p>Hello {{recipientName}},</p>
      <p>Your <strong>{{documentType}}</strong> expires on <strong>{{expiresOn}}</strong>.</p>
      <p><a href="{{portalUrl}}">Open portal</a></p>
    `,
  },

    setup_password: {
    key: 'setup_password',
    enabled: true,
    description: 'Sent when an admin sends a “set your password” setup link.',
    subjectTemplate: 'Set your Extramus password',
    htmlTemplate: `
      <p>Dear {{recipientName}},</p>
      <p>Your account has been created. Please set your password using the link below.</p>
      <p><a class="button" href="{{setupUrl}}">Set Password</a></p>
      <p class="muted">This link expires in {{expiresMinutes}} minutes.</p>
    `,
    variables: ['recipientName', 'setupUrl', 'expiresMinutes'],
    sampleData: {
      recipientName: 'New User',
      setupUrl: `${origin}/change-password?token=example-token`,
      expiresMinutes: 30,
    },
  },

  missing_documents_reminder: {
    key: 'missing_documents_reminder',
    enabled: true,
    description: 'Sent when an employee is missing required documents.',
    subjectTemplate: 'Action Required: Missing documents',
    htmlTemplate: `
      <p>Hello {{recipientName}},</p>
      <p>We noticed that the following documents are missing from your profile:</p>
      {{{missingDocsHtml}}}
      <p><a class="button" href="{{portalUrl}}">Open portal</a></p>
      <p class="muted">If you need help, contact {{hrEmail}}.</p>
    `,
    textTemplate: `
Hello {{recipientName}},

We noticed that the following documents are missing from your profile:

{{missingDocsText}}

Open portal: {{portalUrl}}

If you need help, contact {{hrEmail}}.
    `,
    variables: ['recipientName', 'missingDocsHtml', 'missingDocsText', 'portalUrl', 'hrEmail'],
    sampleData: {
      recipientName: 'Employee',
      missingDocsHtml: '<ul><li>Passport ID</li><li>CV</li></ul>',
      missingDocsText: '- Passport ID\n- CV',
      portalUrl: `${origin}/profile`,
      hrEmail: 'hr@extramus.eu',
    },
  },

  access_revoked: {
    key: 'access_revoked',
    enabled: true,
    description: 'Sent when a user’s portal access is revoked.',
    subjectTemplate: 'Your portal access has been revoked',
    htmlTemplate: `
      <p>Your portal access has been revoked.</p>
      <p class="muted">If you believe this is a mistake, contact HR.</p>
    `,
    variables: [],
    sampleData: {},
  },

  access_restored: {
    key: 'access_restored',
    enabled: true,
    description: 'Sent when a user’s portal access is restored.',
    subjectTemplate: 'Your portal access has been restored',
    htmlTemplate: `
      <p>Your portal access has been restored.</p>
      <p><a class="button" href="{{portalUrl}}">Open portal</a></p>
    `,
    variables: ['portalUrl'],
    sampleData: { portalUrl: origin },
  },

};

export async function ensureEmailTheme() {
  return prisma.emailTheme.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      brandColor: '#4a6cf7',
      headerTitle: 'Welcome to Extramus!',
      logoUrl: null,
      buttonColor: null,
      footerText: null,
    },
  });
}

export async function updateEmailTheme(patch: EmailThemePatch, updatedBy?: number) {
  const theme = await prisma.emailTheme.upsert({
    where: { id: 1 },
    update: {
      ...patch,
      updatedBy: updatedBy ?? null,
    },
    create: {
      id: 1,
      brandColor: patch.brandColor || '#4a6cf7',
      headerTitle: patch.headerTitle ?? 'Welcome to Extramus!',
      logoUrl: patch.logoUrl ?? null,
      buttonColor: patch.buttonColor ?? null,
      footerText: patch.footerText ?? null,
      updatedBy: updatedBy ?? null,
    },
  });
  return theme;
}

export async function listEmailTemplates() {
  const rows = await prisma.emailTemplate.findMany({
    select: { key: true, enabled: true, updatedAt: true, description: true },
    orderBy: { key: 'asc' },
  });

  const byKey = new Map(rows.map(r => [r.key, r]));
  return (ALLOWED_EMAIL_TEMPLATE_KEYS as readonly string[]).map(k => {
    const d = DEFAULTS[k as EmailTemplateKey];
    const r = byKey.get(k);
    return {
      key: k,
      description: r?.description ?? d.description,
      enabled: r?.enabled ?? true,
      source: r ? 'db' : 'default',
      updatedAt: r?.updatedAt ?? null,
    };
  });
}

export async function getEmailTemplateForEdit(keyRaw: string) {
  const key = assertKey(keyRaw);
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  const def = DEFAULTS[key];

  if (row) {
    return { source: 'db' as const, key, ...row };
  }

  return {
    source: 'default' as const,
    key,
    subjectTemplate: def.subjectTemplate,
    htmlTemplate: def.htmlTemplate,
    textTemplate: def.textTemplate ?? null,
    enabled: true,
    description: def.description,
    variables: def.variables,
    sampleData: def.sampleData,
  };
}

export async function upsertEmailTemplate(keyRaw: string, patch: EmailTemplatePatch, updatedBy?: number) {
  const key = assertKey(keyRaw);
  const def = DEFAULTS[key];

  const subjectTemplate = (patch.subjectTemplate ?? def.subjectTemplate).slice(0, 255);
  const htmlTemplate = patch.htmlTemplate ?? def.htmlTemplate;

  const row = await prisma.emailTemplate.upsert({
    where: { key },
    update: {
      subjectTemplate,
      htmlTemplate,
      textTemplate: patch.textTemplate ?? null,
      enabled: patch.enabled ?? true,
      description: patch.description ?? def.description,
      variables: patch.variables ?? def.variables,
      sampleData: patch.sampleData ?? def.sampleData,

      headerTitle: patch.headerTitle ?? null,
      logoUrl: patch.logoUrl ?? null,

      updatedBy: updatedBy ?? null,
    },
    create: {
      key,
      subjectTemplate,
      htmlTemplate,
      textTemplate: patch.textTemplate ?? null,
      enabled: patch.enabled ?? true,
      description: patch.description ?? def.description,
      variables: patch.variables ?? def.variables,
      sampleData: patch.sampleData ?? def.sampleData,

      headerTitle: patch.headerTitle ?? null,
      logoUrl: patch.logoUrl ?? null,

      updatedBy: updatedBy ?? null,
    },
  });

  return row;
}

export async function resetEmailTemplateToDefault(keyRaw: string) {
  const key = assertKey(keyRaw);
  await prisma.emailTemplate.delete({ where: { key } }).catch(() => {});
  return true;
}

export async function renderEmailPreview(keyRaw: string, data?: Record<string, any>) {
  const key = assertKey(keyRaw);
  const theme = await ensureEmailTheme();
  const tpl = await getEmailTemplateForEdit(key);

  const def = DEFAULTS[key];
  const usedData = data ?? (tpl as any).sampleData ?? def.sampleData ?? {};

  const subject = renderVars((tpl as any).subjectTemplate ?? def.subjectTemplate, usedData, 'text');
  const body = renderVars((tpl as any).htmlTemplate ?? def.htmlTemplate, usedData, 'html');

  const tplHeaderTitle = (tpl as any).headerTitle ?? null;
  const tplLogoUrl = (tpl as any).logoUrl ?? null;

    const effectiveTheme = {
        brandColor: theme.brandColor,
        headerTitle: tplHeaderTitle ?? theme.headerTitle,
        logoUrl: tplLogoUrl ?? theme.logoUrl,
        buttonColor: theme.buttonColor,
        footerText: theme.footerText,
    };


  const html = wrapWithTheme({
  bodyHtml: body,
  theme: effectiveTheme,
});


  const text = (tpl as any).textTemplate
    ? renderVars((tpl as any).textTemplate, usedData, 'text')
    : undefined;

  return { key, subject, html, text, dataUsed: usedData };
}
