// backend/src/lib/mailer.ts
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import prisma from '../prisma';
import { getEmailTemplateForEdit, renderEmailPreview, type EmailTemplateKey } from './emailTemplates';


const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/,'');

type Conf = {
  host: string; port: number; encryption: 'NONE'|'STARTTLS'|'TLS';
  user: string; pass: string; fromName: string; fromEmail: string;
};

let cache: { key: string; transporter: Transporter; from: string } | null = null;

function keyOf(c: Conf) {
  return JSON.stringify({ h:c.host, p:c.port, e:c.encryption, u:c.user, f:c.fromEmail });
}

function buildTransport(c: Conf): Transporter {
  if (c.encryption === 'TLS') {
    return nodemailer.createTransport({ host: c.host, port: c.port || 465, secure: true, auth: { user: c.user, pass: c.pass } });
  }
  if (c.encryption === 'STARTTLS') {
    return nodemailer.createTransport({ host: c.host, port: c.port || 587, secure: false, requireTLS: true, auth: { user: c.user, pass: c.pass } });
  }
  return nodemailer.createTransport({ host: c.host, port: c.port || 25, secure: false, auth: { user: c.user, pass: c.pass } });
}

async function loadConf(): Promise<Conf> {
  const row = await prisma.smtpSetting.findUnique({ where: { id: 1 } });
  if (!row || !row.host || !row.user || !row.fromEmail || !row.pass) {
    throw new Error('SMTP is not configured.');
  }
  return {
    host: row.host,
    port: row.port,
    encryption: row.encryption as any,
    user: row.user,
    pass: row.pass,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
  };
}

export async function getMailer(): Promise<{ transporter: Transporter; from: string }> {
  const conf = await loadConf();
  const k = keyOf(conf);
  if (!cache || cache.key !== k) {
    cache = {
      key: k,
      transporter: buildTransport(conf),
      from: conf.fromName ? `${conf.fromName} <${conf.fromEmail}>` : conf.fromEmail,
    };
  }
  return cache;
}

export function invalidateMailerCache() { cache = null; }



export async function sendMail(
  opts: SendMailOptions & { to: string; subject: string }
) {
  const { transporter, from } = await getMailer();
  await transporter.sendMail({ from, ...opts });
  return true;
}

export async function sendTemplateMail(args: {
  key: EmailTemplateKey;
  to: string;
  data?: Record<string, any>;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}) {
  const tpl = await getEmailTemplateForEdit(args.key);
  if (tpl.enabled === false) {
    return { ok: true, skipped: true, reason: 'template_disabled' as const };
  }

  const out = await renderEmailPreview(args.key, args.data ?? {});
  await sendMail({
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    replyTo: args.replyTo,
    subject: out.subject,
    html: out.html,
    text: out.text ?? undefined,
  });

  return { ok: true, skipped: false };
}









export async function sendProvisioningEmail(args: {
  to: string; // personal email address
  companyEmail: string;
  siteTempPassword?: string;
  googleCreated?: boolean;
  googlePassword?: string;
  googleError?: string;
  recipientName?: string;
}) {
  const googlePasswordLine = args.googleCreated
    ? (args.googlePassword ?? '')
    : (args.googleError ? `Not created (${args.googleError})` : 'Not created');

  return sendTemplateMail({
    key: 'welcome_credentials',
    to: args.to,
    data: {
      recipientName: args.recipientName ?? 'New User',
      companyEmail: args.companyEmail,
      googlePasswordLine,
      sitePassword: args.siteTempPassword ?? '',
      portalUrl: origin,
    },
  });
}




// small helper for HTML escaping
function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}




export async function sendProjectAddedNotice(args: {
  to: string;
  projectTitle: string;
  projectId: number;
  teamEmails: string[];
}) {
  const projectUrl = `${origin}/projects/${args.projectId}`;
  const teamList = args.teamEmails.join(', ');

  return sendTemplateMail({
    key: 'project_member_added',
    to: args.to,
    data: { projectTitle: args.projectTitle, projectUrl, teamList },
  });
}


export async function sendProjectStatusNotice(args: {
  to: string;
  projectTitle: string;
  projectId: number;
  newStatus: string;
}) {
  const projectUrl = `${origin}/projects/${args.projectId}`;
  const newStatusLabel = args.newStatus.replace(/_/g, ' ');

  return sendTemplateMail({
    key: 'project_status_changed',
    to: args.to,
    data: { projectTitle: args.projectTitle, projectUrl, newStatus: newStatusLabel },
  });
}


export async function sendAccessRevokedNotice(toEmail: string) {
  return sendTemplateMail({ key: 'access_revoked', to: toEmail, data: {} });
}


export async function sendAccessRestoredNotice(toEmail: string) {
  return sendTemplateMail({ key: 'access_restored', to: toEmail, data: { portalUrl: origin } });
}



export async function sendProjectRemovedNotice(args: {
  to: string;
  projectTitle: string;
  projectId: number;
}) {
  const projectUrl = `${origin}/projects/${args.projectId}`;

  return sendTemplateMail({
    key: 'project_member_removed',
    to: args.to,
    data: { projectTitle: args.projectTitle, projectUrl },
  });
}

export async function sendProjectDeletedNotice(args: {
  to: string;
  projectTitle: string;
  deletedByName?: string;
}) {
  const projectsUrl = `${origin}/projects`;

  return sendTemplateMail({
    key: 'project_deleted',
    to: args.to,
    data: {
      projectTitle: args.projectTitle,
      deletedByName: args.deletedByName ?? 'Admin',
      projectsUrl,
    },
  });
}

