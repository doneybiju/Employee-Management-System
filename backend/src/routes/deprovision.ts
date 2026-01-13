// backend/src/routes/deprovision.ts
import { Router, Request, Response } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import prisma from '../prisma';
import {
  getPolicyDb,
  updatePolicyDb,
  runDeprovisionOnce,
  runGoogleThenDbOnce,
  getUpcoming,
  runDocumentDeletionCycle, 
} from '../lib/deprovision';


import { deprovisionIfDueForUserId } from '../lib/deprovision';


type DelayUnit = 'days' | 'weeks' | 'months';
const router = Router();

// Local backend type for upcoming rows


router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});


router.get('/policy', ensureAuthenticated, authorize('super_admin'), async (_req: Request, res: Response) => {
  const p = await getPolicyDb();
  res.json(p);
});







router.put('/policy', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const { enabled, delayAmount, delayUnit } = req.body || {};

  if (delayUnit && !['days','weeks','months'].includes(delayUnit)) {
    return res.status(400).json({ error: 'invalid_delay_unit' });
  }

  // Only touch transferTargetEmail if the key was provided.
  let transferTargetEmail: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(req.body, 'transferTargetEmail')) {
    const raw = req.body.transferTargetEmail;
    const v = typeof raw === 'string' ? raw.trim() : '';
    transferTargetEmail = v ? v : null; // null explicitly disables
  }

  await updatePolicyDb({
    enabled,
    delayAmount: Number.isFinite(delayAmount as any) ? Number(delayAmount) : undefined,
    delayUnit: delayUnit as any,
    transferTargetEmail, // <-- pass through (string | null | undefined)
  });

  const p = await getPolicyDb();
  res.json(p);
});





/* ========= deprovision whitelist ========= */

// GET /api/deprovision/whitelist
router.get('/whitelist', ensureAuthenticated, authorize('super_admin'), async (_req: Request, res: Response) => {
  const rows = await prisma.reminderWhitelist.findMany({
    where: { skipDeprov: true },
    select: { userId: true, user: { select: { id: true, firstName: true, surname: true, empId: true, role: true, companyEmail: true } } },
    orderBy: [{ user: { surname: 'asc' } },{ user: { firstName: 'asc' } }],
  });
  res.json({ items: rows });
});

// POST /api/deprovision/whitelist  { userId }
router.post('/whitelist', ensureAuthenticated, authorize('super_admin'), async (req: Request, res: Response) => {
  const userId = Number(req.body?.userId);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const exists = await prisma.reminderWhitelist.findUnique({ where: { userId } });
  const row = exists
    ? await prisma.reminderWhitelist.update({ where: { userId }, data: { skipDeprov: true } })
    : await prisma.reminderWhitelist.create({ data: { userId, skipDocs: false, skipDeprov: true } });
  res.json({ ok: true, row });
});

// DELETE /api/deprovision/whitelist/:userId
router.delete('/whitelist/:userId', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'invalid_userId' });
  }

  try {
    const row = await prisma.reminderWhitelist.findUnique({ where: { userId } });

    if (row) {
      // preserve skipDocs if set; otherwise delete row
      if (row.skipDocs) {
        await prisma.reminderWhitelist.update({ where: { userId }, data: { skipDeprov: false } });
      } else {
        await prisma.reminderWhitelist.delete({ where: { userId } });
      }
    }

    // Immediately deprovision if already due (policy OR endDate <= yesterday)
    const deprovision = await deprovisionIfDueForUserId(userId).catch(() => null);

    return res.json({
      ok: true,
      removed: !!row,
      deprovision,
    });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || 'delete_failed' });
  }
});




// GET /api/deprovision/upcoming
router.get('/upcoming', ensureAuthenticated, authorize('super_admin'), async (req: Request, res: Response) => {
  const windowDays = Math.max(1, Math.min(30, Number(req.query.windowDays) || 7));
  const data = await getUpcoming(windowDays); // lib already filters whitelist
  res.json(data);
});



const runNowHandler = async (_req: Request, res: Response) => {
  const pol = await getPolicyDb();
  if (!pol.enabled) return res.status(400).json({ error: 'Deprovision is disabled' });
  const out = await runGoogleThenDbOnce(); // lib already excludes whitelist
  res.json(out);
};


router.post('/run-now', ensureAuthenticated, authorize('super_admin'), runNowHandler);
router.post('/run-google-then-db', ensureAuthenticated, authorize('super_admin'), runNowHandler);
router.post('/run-db-only', ensureAuthenticated, authorize('super_admin'), async (_req: Request, res: Response) => {
  const out = await runDeprovisionOnce();
  res.json(out);
});

// /* ===== Document Deletion (docs + optional avatar) ===== */

// // GET /api/deprovision/doc-cleanup/policy
// router.get('/doc-cleanup/policy', ensureAuthenticated, authorize('super_admin'), async (_req, res) => {
//   const p = await prisma.documentDeletionPolicy.upsert({
//     where: { id: 1 },
//     update: {},
//     create: { id: 1, enabled: false, delayAmount: 0, delayUnit: 'days', includeAvatar: false, lastRunAt: null, lastDeleted: 0 },
//   });
//   // mirror both keys for frontend compatibility
//   res.json({ ...p, includeProfileImage: p.includeAvatar });
// });

// // PUT /api/deprovision/doc-cleanup/policy
// router.put('/doc-cleanup/policy', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
//   const b = req.body ?? {};
//   const patch: any = {};

//   if (typeof b.enabled === 'boolean')       patch.enabled = b.enabled;
//   if (Number.isFinite(b.delayAmount))       patch.delayAmount = Math.max(0, Math.min(30, Math.trunc(Number(b.delayAmount))));
//   if (b.delayUnit && ['days','weeks','months'].includes(b.delayUnit)) patch.delayUnit = b.delayUnit;

//   // normalize avatar flag from either key
//   if (typeof b.includeAvatar === 'boolean')         patch.includeAvatar = b.includeAvatar;
//   if (typeof b.includeProfileImage === 'boolean')   patch.includeAvatar = b.includeProfileImage;

//   const p = await prisma.documentDeletionPolicy.upsert({
//     where: { id: 1 },
//     update: patch,
//     create: {
//       id: 1,
//       enabled: !!patch.enabled,
//       delayAmount: patch.delayAmount ?? 0,
//       delayUnit: patch.delayUnit ?? 'days',
//       includeAvatar: !!patch.includeAvatar,
//       lastRunAt: null,
//       lastDeleted: 0,
//     },
//   });

//   res.json({ ...p, includeProfileImage: p.includeAvatar });
// });

// // token-protected cron entry so the server can trigger the same run
// router.post('/cron-run', async (req, res) => {
//   const auth = req.headers.authorization || '';
//   const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
//   if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
//     return res.status(401).json({ error: 'unauthorized' });
//   }
//   try {
//     const pol = await getPolicyDb();
//     if (!pol.enabled) return res.status(400).json({ error: 'Deprovision is disabled' });
//     const out = await runGoogleThenDbOnce();
//     return res.json(out);
//   } catch (e: any) {
//     return res.status(500).json({ error: e?.message || 'deprovision failed', debug: e?.response?.data });
//   }
// });


// // POST /api/deprovision/doc-cleanup/run-now
// router.post('/doc-cleanup/run-now', ensureAuthenticated, authorize('super_admin'), async (req: Request, res: Response) => {
//   const b = req.body ?? {};
//   const includeAvatar = Boolean(b.includeAvatar ?? b.includeProfileImage);
//   const ignoreDelay = b.ignoreDelay !== false; // default true
//   const out = await runDocumentDeletionCycle({ includeAvatar, ignoreDelay });
//   if ((out as any).skipped) return res.status(400).json({ error: 'Document deletion is disabled' });
//   res.json(out);
// });

// router.post('/doc-cleanup/cron-run', async (req, res) => {
//   const auth = req.headers.authorization || '';
//   const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
//   if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
//     return res.status(401).json({ error: 'unauthorized' });
//   }
//   const out = await runDocumentDeletionCycle({ ignoreDelay: true, includeAvatar: false });
//   if ((out as any).skipped) return res.status(400).json({ error: 'Document deletion is disabled' });
//   res.json(out);
// });




export default router;
