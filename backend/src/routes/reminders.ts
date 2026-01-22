// backend/src/routes/reminders.ts
import { Router } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import prisma from '../prisma';
import { sendTemplateMail } from '../lib/mailer';
import cronAuth from '../middleware/cronAuth';

const router = Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});



// Required document types (match your Prisma enum values)
const REQUIRED: Array<
  'ACCEPTANCE_LETTER' | 'LEARNING_AGREEMENT' | 'ID_PASSPORT' | 'CV'
> = ['ACCEPTANCE_LETTER', 'LEARNING_AGREEMENT', 'ID_PASSPORT', 'CV'];

/* ========= helpers ========= */

export async function getOrCreatePolicy() {
  const found = await prisma.documentReminderPolicy.findFirst();
  if (found) return found;
  return prisma.documentReminderPolicy.create({
    data: {
      id: 1,
      enabled: false,
      everyDays: 7,
      emailEnabled: false,
      autoPurgeEnabled: false,
      autoPurgeDays: 90,
    },
  });
}



function _niceName(t: string) {
  switch (t) {
    case 'ACCEPTANCE_LETTER': return 'Acceptance Letter';
    case 'LEARNING_AGREEMENT': return 'Learning Agreement';
    case 'ID_PASSPORT': return 'Passport ID';
    case 'CV': return 'CV / Resume';
    default: return t;
  }
}

function _todayRange() {
  const s = new Date(); s.setHours(0,0,0,0);
  const e = new Date(); e.setHours(23,59,59,999);
  return { s, e };
}

export async function purgeOlderThanDays(olderThanDays: number, scope: 'inbox'|'history'|'both' = 'both') {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, Math.trunc(olderThanDays)));

  let inboxDeleted = 0;
  let historyDeleted = 0;

  if (scope === 'inbox' || scope === 'both') {
    const r = await prisma.userReminderInbox.deleteMany({ where: { createdAt: { lt: cutoff } } });
    inboxDeleted = r.count;
  }
  if (scope === 'history' || scope === 'both') {
    const r = await prisma.documentReminderHistory.deleteMany({ where: { sentAt: { lt: cutoff } } });
    historyDeleted = r.count;
  }
  return { inboxDeleted, historyDeleted, cutoff };
}



/* ========= policy ========= */


  





// GET /api/reminders/policy
router.get('/policy', ensureAuthenticated, authorize('super_admin'), async (_req, res) => {
  const p = await getOrCreatePolicy();
  return res.json({
    ...p,
    historyRetentionMonths: (p as any).historyRetentionMonths ?? 0, // ← ADD
  });
});


// PUT /api/reminders/policy
router.put('/policy', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const body = req.body || {};
  const p = await getOrCreatePolicy();
  const updated = await prisma.documentReminderPolicy.update({
    where: { id: p.id },
    data: {
  enabled: typeof body.enabled === 'boolean' ? body.enabled : p.enabled,
  everyDays: Number.isFinite(body.everyDays) ? Math.max(1, Number(body.everyDays)) : p.everyDays,
  emailEnabled: typeof body.emailEnabled === 'boolean' ? body.emailEnabled : p.emailEnabled,
  autoPurgeEnabled: typeof body.autoPurgeEnabled === 'boolean' ? body.autoPurgeEnabled : p.autoPurgeEnabled,
  autoPurgeDays: Number.isFinite(body.autoPurgeDays) ? Math.max(1, Number(body.autoPurgeDays)) : p.autoPurgeDays,
},

  });
  return res.json(updated);
});


/* ========= whitelist ========= */

// GET /api/reminders/whitelist
router.get('/whitelist', ensureAuthenticated, authorize('super_admin'), async (_req, res) => {
  const rows = await prisma.reminderWhitelist.findMany({
    where: { skipDocs: true },
    select: { userId: true, user: { select: { id: true, firstName: true, surname: true, empId: true, role: true, companyEmail: true } } },
    orderBy: [{ user: { surname: 'asc' } },{ user: { firstName: 'asc' } }],
  });
  res.json({ items: rows });
});

// POST /api/reminders/whitelist  { userId }
router.post('/whitelist', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const userId = Number(req.body?.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const exists = await prisma.reminderWhitelist.findUnique({ where: { userId } });
  const row = exists
    ? await prisma.reminderWhitelist.update({ where: { userId }, data: { skipDocs: true } })
    : await prisma.reminderWhitelist.create({ data: { userId, skipDocs: true, skipDeprov: false } });
  res.json({ ok: true, row });
});

// DELETE /api/reminders/whitelist/:userId
router.delete('/whitelist/:userId', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  const row = await prisma.reminderWhitelist.findUnique({ where: { userId } });
  if (!row) return res.json({ ok: true });
  if (row.skipDeprov) {
    await prisma.reminderWhitelist.update({ where: { userId }, data: { skipDocs: false } });
  } else {
    await prisma.reminderWhitelist.delete({ where: { userId } });
  }
  res.json({ ok: true });
});


/* ========= run-now & history ========= */


// POST /api/reminders/run-now  (allows either super_admin session OR CRON token)
async function runRemindersOnce() {
  const policy = await prisma.documentReminderPolicy.upsert({
    where: { id: 1 },
    update: { lastRunAt: new Date() },
    create: { id: 1, enabled: false, everyDays: 7, emailEnabled: false, lastRunAt: new Date() },
  });

  const blockedDocs = new Set(
    (await prisma.reminderWhitelist.findMany({ where: { skipDocs: true }, select: { userId: true } }))
      .map(w => w.userId)
  );

  const users = await prisma.user.findMany({
    select: {
      id: true, firstName: true, surname: true, companyEmail: true, role: true,
      employeeDetails: {
        select: {
          employeeId: true,
          employeeDocuments: { select: { documentType: true, status: true, isActive: true } },
        },
        take: 1,
      },
    },
  });

  const REQUIRED: Array<'ACCEPTANCE_LETTER'|'LEARNING_AGREEMENT'|'ID_PASSPORT'|'CV'> =
    ['ACCEPTANCE_LETTER','LEARNING_AGREEMENT','ID_PASSPORT','CV'];
  const pretty = (t: string) => 
    ({ACCEPTANCE_LETTER:'Acceptance Letter',LEARNING_AGREEMENT:'Learning Agreement',ID_PASSPORT:'ID/Passport',CV:'CV'} as any)[t] || t;

  const inboxRows: { userId: number; message: string }[] = [];
  let totalRecipients = 0;
  const breakdown: Record<string, number> = {};

  for (const u of users) {
    if (blockedDocs.has(u.id)) continue;
    const det = u.employeeDetails[0];
    if (!det) continue;

    const uploaded = new Set(
      det.employeeDocuments
        .filter(d => d.isActive && d.status !== 'rejected')
        .map(d => d.documentType)
    );
    const missing = REQUIRED.filter(t => !uploaded.has(t));
    if (!missing.length) continue;

    const list = missing.map(pretty);
    const last = list[list.length - 1] || '';
    const textList = list.length === 1 ? last : `${list.slice(0, -1).join(', ')} and ${last}`;
    const msg = `You have ${missing.length} document${missing.length > 1 ? 's' : ''} to upload: ${textList}`;

    inboxRows.push({ userId: u.id, message: msg });
    totalRecipients += 1;
    for (const m of list) breakdown[m] = (breakdown[m] || 0) + 1;

    // Replace the email sending section in the runRemindersOnce() function:

if (policy.emailEnabled && u.companyEmail) {
  try {
    const portalUrl = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

    const missingDocsText = missing.map(d => `- ${d}`).join('\n');
    const missingDocsHtml = `<ul>${missing.map(d => `<li>${d}</li>`).join('')}</ul>`;

    await sendTemplateMail({
      key: 'missing_documents_reminder',
      to: u.companyEmail,
      data: {
        recipientName: `${u.firstName} ${u.surname}`.trim() || u.companyEmail,
        missingDocsText,
        missingDocsHtml,
        portalUrl: `${portalUrl}/profile`,
        hrEmail: 'hr@extramus.eu',
      },
    });
  } catch (error) {
    console.error('Failed to send document reminder email:', error);
  }
}

  }

  const uids = Array.from(new Set(inboxRows.map(r => r.userId)));
  if (uids.length) {
    await prisma.userReminderInbox.updateMany({ where: { userId: { in: uids }, readAt: null }, data: { readAt: new Date() } });
    await prisma.userReminderInbox.createMany({ data: inboxRows });
  }

  await prisma.documentReminderHistory.create({
    data: { totalRecipients, missingBreakdown: Object.keys(breakdown).length ? breakdown : undefined },
  });

  try {
    const pol = await prisma.documentReminderPolicy.findUnique({
      where: { id: 1 },
      select: { historyRetentionMonths: true },
    });
    const keepMonths = Number(pol?.historyRetentionMonths ?? 0);
    if (keepMonths > 0) {
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - keepMonths);
      await prisma.userReminderInbox.deleteMany({ where: { createdAt: { lt: cutoff } } });
    }
  } catch (e) {
    console.error('[reminders] prune UserReminderInbox failed:', e);
  }

  return { sent: totalRecipients, breakdown, emailEnabled: policy.emailEnabled };
}

// UI/manual button (still requires logged-in super_admin)
router.post('/run-now', ensureAuthenticated, authorize('super_admin'), async (_req, res) => {
  const out = await runRemindersOnce();
  res.json(out);
});

// CRON-only endpoint (auth by CRON_TOKEN)
router.post('/cron-run', cronAuth, async (_req, res) => {
  const out = await runRemindersOnce();
  res.json(out);
});




// GET /api/reminders/history?limit=20
router.get('/history', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma','no-cache');
  res.set('Expires','0');

  const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit || '20'), 10) || 20));
  const items = await prisma.documentReminderHistory.findMany({
    orderBy: { sentAt: 'desc' },
    take: limit,
  });
  return res.json({ items });
});



// POST /api/reminders/purge
// Body: { olderThanDays?: number, applyTo?: 'inbox' | 'history' | 'both' }
// Deletes rows older than "olderThanDays" (default 30) from:
//  - userReminderInbox.createdAt (inbox)
//  - documentReminderHistory.sentAt (history)
router.post('/purge', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  try {
    const forceAll = Boolean(req.body?.forceAll);
    const olderThanDays = Math.max(1, Math.trunc(Number(req.body?.olderThanDays ?? 30)));
    const scope = (String(req.body?.applyTo || 'both') as 'inbox'|'history'|'both');

    let inboxDeleted = 0;
    let historyDeleted = 0;

    if (forceAll) {
      const r1 = await prisma.userReminderInbox.deleteMany({});
      const r2 = await prisma.documentReminderHistory.deleteMany({});
      inboxDeleted = r1.count; historyDeleted = r2.count;
      return res.json({ ok: true, forceAll: true, deleted: { inbox: inboxDeleted, history: historyDeleted } });
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - olderThanDays);

    if (scope === 'inbox' || scope === 'both') {
      const r = await prisma.userReminderInbox.deleteMany({ where: { createdAt: { lt: cutoff } } });
      inboxDeleted = r.count;
    }
    if (scope === 'history' || scope === 'both') {
      const r = await prisma.documentReminderHistory.deleteMany({ where: { sentAt: { lt: cutoff } } });
      historyDeleted = r.count;
    }

    return res.json({ ok: true, olderThanDays, deleted: { inbox: inboxDeleted, history: historyDeleted } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'purge failed' });
  }
});


// POST /api/reminders/purge/auto-run
// Idempotent tick called by the in-process scheduler.
// If enabled, purges using policy.autoPurgeDays and records lastPurgeAt.
router.post(
  '/purge/auto-run',
  async (_req, res) => {
    try {
      const p = await getOrCreatePolicy();
      if (!p.autoPurgeEnabled) return res.json({ ok: true, skipped: true, reason: 'disabled' });

      const { inboxDeleted, historyDeleted, cutoff } =
        await purgeOlderThanDays(p.autoPurgeDays, 'both');

      await prisma.documentReminderPolicy.update({
        where: { id: p.id },
        data: { lastPurgeAt: new Date() },
      });

      return res.json({
        ok: true,
        autoPurgeDays: p.autoPurgeDays,
        cutoff,
        deleted: { inbox: inboxDeleted, history: historyDeleted }
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'auto-run failed' });
    }
  }
);



/* ========= user inbox (shown by DocsReminderToast) ========= */

// GET /api/reminders/inbox  -> next unread for logged-in user
router.get('/inbox', ensureAuthenticated, async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const item = await prisma.userReminderInbox.findFirst({
    where: { userId, readAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, message: true },
  });
  if (!item) return res.json(null);
  return res.json(item);
});

// POST /api/reminders/inbox/:id/read
router.post('/inbox/:id/read', ensureAuthenticated, async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const id = Number(req.params.id);
  await prisma.userReminderInbox.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.json({ ok: true });
});



// // GET /api/reminders/me  → used by the UI toast/widget; prevents noisy 404s
// router.get('/me', ensureAuthenticated as any, async (req, res) => {
//   const userId = Number((req as any).user?.id);
//   if (!userId) return res.status(401).json({ error: 'unauthorized' });
//   const inboxUnread = await prisma.userReminderInbox.count({ where: { userId, readAt: null } });
//   res.json({ inboxUnread, items: [] });
// });

// GET /api/reminders/me  -> backward-compatible alias of /inbox
router.get('/me', ensureAuthenticated, async (req, res) => {
  const userId = Number((req as any).user?.id);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const item = await prisma.userReminderInbox.findFirst({
    where: { userId, readAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, message: true },
  });
  if (!item) return res.json(null);
  return res.json(item);
});


export default router;
