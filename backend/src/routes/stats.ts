// backend/src/routes/stats.ts
import { Router } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { authorize } from '../middleware/authorize';
import { loadAdminSummary, loadInternDashboardByUserId } from '../lib/status';

import prisma from '../prisma';

const router = Router();

/**
 * GET /api/stats/me  (intern + staff)
 * Returns the dashboard data for the logged-in user.
 */
router.get('/me', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const data = await loadInternDashboardByUserId(userId);
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});

/**
 * GET /api/stats/admin/summary  (hr + super_admin)
 * High-level numbers for the admin dashboard.
 */
router.get(
  '/admin/summary',
  ensureAuthenticated,
  ...authorize('hr', 'super_admin'),
  async (_req, res) => {
    try {
      const data = await loadAdminSummary();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed' });
    }
  }
);


router.get(
  '/active-interns',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (_req, res) => {
    try {
      // latest row per internId where status is Active
      const rows = await prisma.internshipInfo.findMany({
        where: { status: 'Active' },
        orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
        select: { internId: true, startDate: true, endDate: true },
      });

      const latest = new Map<string, { startDate: Date | null; endDate: Date | null }>();
      for (const r of rows) if (!latest.has(r.internId)) latest.set(r.internId, r);

      const today = new Date();
      let count = 0;
      for (const r of latest.values()) {
        const started = !r.startDate || r.startDate <= today;
        const notEnded = !r.endDate || r.endDate >= today;
        if (started && notEnded) count++;
      }

      return res.json({ count, byMonth: [] });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'failed' });
    }
  }
);


/**
 * GET /api/stats/deadlines  (everyone, returns current user's upcoming items)
 * Window: next 30 days
 */
router.get('/deadlines', ensureAuthenticated as any, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);

    const items: Array<{ kind: 'task' | 'internship_end' | 'document_expiry'; title: string; dueDate: string; subtitle?: string }> = [];

    // find the user's intern profile and latest internship
    const me = await prisma.internDetail.findFirst({
      where: { userId },
      select: {
        internId: true,
        internships: {
          orderBy: { startDate: 'desc' },
          take: 1,
          select: { endDate: true },
        },
      },
    });

    // Internship end
    const internshipEnd = me?.internships?.[0]?.endDate || null;
    if (internshipEnd && internshipEnd > now && internshipEnd <= end) {
      items.push({
        kind: 'internship_end',
        title: 'Internship ends',
        dueDate: internshipEnd.toISOString(),
      });
    }

    // Tasks due for this user
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        dueDate: { gte: now, lte: end },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      select: {
        title: true,
        dueDate: true,
        project: { select: { title: true } },
      },
    });
    for (const t of tasks) {
      if (!t.dueDate) continue;
      items.push({
        kind: 'task',
        title: t.title,
        dueDate: t.dueDate.toISOString(),
        subtitle: t.project?.title,
      });
    }

    // Document expiries for this intern
    if (me?.internId) {
      const docs = await prisma.internDocument.findMany({
        where: {
          internId: me.internId,
          isActive: true,
          expiryDate: { not: null, gte: now, lte: end },
        },
        select: { documentType: true, expiryDate: true },
      });
      for (const d of docs) {
        if (!d.expiryDate) continue;
        items.push({
          kind: 'document_expiry',
          title: `${String(d.documentType).replace('_', ' ')} expires`,
          dueDate: d.expiryDate.toISOString(),
        });
      }
    }

    // sort + limit
    items.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
    return res.json({ items: items.slice(0, 10) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'failed' });
  }
});


export default router;