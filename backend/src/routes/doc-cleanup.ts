// backend/src/routes/doc-cleanup.ts
import { Router, Request, Response } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import prisma from '../prisma';
import { runDocumentDeletionCycle } from '../lib/deprovision';
import { DelayUnit } from '@prisma/client';
import cronAuth from '../middleware/cronAuth';

const router = Router();

function addDelay(date: Date, amount: number, unit: DelayUnit): Date {
  const d = new Date(date);
  if (unit === 'days') d.setDate(d.getDate() + amount);
  else if (unit === 'weeks') d.setDate(d.getDate() + amount * 7);
  else if (unit === 'months') d.setMonth(d.getMonth() + amount);
  return d;
}


router.get('/policy', ensureAuthenticated, authorize('super_admin'), async (_req, res) => {
  const row = await prisma.documentDeletionPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabled: false, delayAmount: 0, delayUnit: 'days', includeAvatar: false },
  });
  res.json({ ...row, includeProfileImage: row.includeAvatar });
});

router.put('/policy', ensureAuthenticated, authorize('super_admin'), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const patch: {
    enabled?: boolean;
    delayAmount?: number;
    delayUnit?: DelayUnit;
    includeAvatar?: boolean;
  } = {};
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (Number.isFinite(b.delayAmount)) patch.delayAmount = Math.max(0, Math.min(30, Math.trunc(b.delayAmount)));
  if (['days','weeks','months'].includes(b.delayUnit)) patch.delayUnit = b.delayUnit;
  if (typeof b.includeAvatar === 'boolean') patch.includeAvatar = b.includeAvatar;
  // accept legacy alias
  if (typeof b.includeProfileImage === 'boolean') patch.includeAvatar = b.includeProfileImage;

  const next = await prisma.documentDeletionPolicy.update({ where: { id: 1 }, data: patch });
  res.json({ ...next, includeProfileImage: next.includeAvatar });

});


// GET /api/deprovision/doc-cleanup/upcoming?windowDays=30
router.get('/upcoming', ensureAuthenticated, authorize('super_admin'), async (req: Request, res: Response) => {
  const windowDaysRaw = Number(req.query.windowDays ?? 30);
  const windowDays = Number.isFinite(windowDaysRaw) ? Math.max(1, Math.min(365, Math.trunc(windowDaysRaw))) : 30;

  // read policy (creates row if missing)
  const pol = await prisma.documentDeletionPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabled: false, delayAmount: 0, delayUnit: 'days', includeAvatar: false },
  });

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  // Whitelist: skipDocs=true means do not delete docs
  const wl = await prisma.reminderWhitelist.findMany({
    where: { skipDocs: true },
    select: { userId: true },
  });
  const wlSet = new Set(wl.map(w => w.userId));

  // Latest employment endDate per employee
  const latest = await prisma.employeeInfo.findMany({
    where: { endDate: { not: null } },
    orderBy: { endDate: 'desc' },
    distinct: ['employeeId'],
    include: {
      employee: {
        select: {
          employeeId: true,
          name: true,
          email: true,
          userId: true,
          user: { select: { companyEmail: true } },
        },
      },
    },
  });

  // compute delete date + filter within window
  const candidates = latest
    .filter(r => {
      const uid = r.employee?.userId ?? null;
      return !(uid && wlSet.has(uid));
    })
    .map(r => {
      const endDate = r.endDate as Date;
      const deleteAt = addDelay(endDate, pol.delayAmount ?? 0, pol.delayUnit);
      return { r, endDate, deleteAt };
    })
    .filter(x => x.deleteAt >= now && x.deleteAt <= windowEnd);

  const employeeIds = candidates.map(x => x.r.employeeId);

  // count active docs per employee (and whether profile picture exists)
  const docs = employeeIds.length
    ? await prisma.employeeDocument.findMany({
        where: { employeeId: { in: employeeIds }, isActive: true },
        select: { employeeId: true, documentType: true },
      })
    : [];

  const byEmployee = new Map<string, { docs: number; hasProfilePicture: boolean }>();
  for (const d of docs) {
    const cur = byEmployee.get(d.employeeId) ?? { docs: 0, hasProfilePicture: false };
    if (d.documentType === 'PROFILE_PICTURE') cur.hasProfilePicture = true;
    else cur.docs += 1;
    byEmployee.set(d.employeeId, cur);
  }

  const items = candidates
    .map(x => {
      const employee = x.r.employee;
      const counts = byEmployee.get(x.r.employeeId) ?? { docs: 0, hasProfilePicture: false };

      return {
        employeeId: x.r.employeeId,
        name: employee?.name ?? `Employee ${x.r.employeeId}`,
        email: employee?.user?.companyEmail ?? employee?.email ?? null,
        endDate: x.endDate.toISOString(),
        deleteAt: x.deleteAt.toISOString(),
        docsCount: counts.docs,
        hasProfilePicture: counts.hasProfilePicture,
        includeAvatarByPolicy: !!pol.includeAvatar,
      };
    })
    .sort((a, b) => a.deleteAt.localeCompare(b.deleteAt));

  res.json({
    windowDays,
    policy: {
      enabled: pol.enabled,
      delayAmount: pol.delayAmount,
      delayUnit: pol.delayUnit,
      includeAvatar: pol.includeAvatar,
    },
    items,
  });
});




router.post('/run-now', ensureAuthenticated, authorize('super_admin'), async (req, res) => {
  const includeAvatar = !!(req.body?.includeAvatar ?? req.body?.includeProfileImage);
  const out = await runDocumentDeletionCycle({ ignoreDelay: true, includeAvatar });
if ((out as any).skipped) return res.status(400).json({ error: 'Document deletion is disabled' });
res.json(out);

});

// CRON-only: uses token; ignores delay=false by default (i.e., honors policy delay)
router.post('/cron-run', cronAuth, async (req, res) => {
  const includeAvatar = !!(req.body?.includeAvatar ?? req.body?.includeProfileImage);
  const out = await runDocumentDeletionCycle({ ignoreDelay: false, includeAvatar });
  if ((out as any).skipped) return res.status(400).json({ error: 'Document deletion is disabled' });
  res.json(out);
});


export default router;
