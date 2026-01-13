// backend/src/routes/users.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { authorize } from '../middleware/authorize';
import { InternshipStatus } from '@prisma/client';

import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { enforceNotBlocked } from '../middleware/enforceNotBlocked';



const router = Router();

/**
 * Helpers
 */



// --- status helpers (no hard-coded enum values) ---
type StatusLabel = string;

async function getInternStatusLabels() {
  const rows = await prisma.internshipInfo.findMany({
    select: { status: true },
    distinct: ['status'],
    take: 20,
  });
  return Array.from(new Set(rows.map(r => String(r.status))));
}
function chooseInactive(labels: StatusLabel[]): StatusLabel {
  const preferred = ['inactive','completed','ended','terminated','closed','finished','offboarded','deprovisioned'];
  for (const p of preferred) {
    const hit = labels.find(v => v.toLowerCase() === p);
    if (hit) return hit;
  }
  const active = labels.find(v => v.toLowerCase() === 'active');
  const fallback = labels.find(v => v !== active);
  return fallback ?? 'inactive';
}
async function setInternInactive(internId: string) {
  const labels = await getInternStatusLabels();
  const target = chooseInactive(labels);
  const upd = await prisma.internshipInfo.updateMany({
    where: { internId },
    data: { status: target as any },
  });
  return { target, count: upd.count };
}
async function isInternActive(internId: string) {
  const latest = await prisma.internshipInfo.findFirst({
    where: { internId },
    orderBy: { id: 'desc' },
    select: { status: true },
  });
  return String(latest?.status || '').toLowerCase() === 'active';
}












// ________________________________________________________________________________________







function toLowerStatus(s: string | null | undefined) {
  if (!s) return 'inactive';
  const v = String(s).toLowerCase();
  return v === 'active' ? 'active' : 'inactive';
}


/**
 * Build row objects expected by the admin/users page.
 * Does NOT rely on Prisma relation names for department/position.
 */
async function buildRows() {
  // Latest internship row per intern
  const latest = await prisma.internshipInfo.findMany({
    orderBy: { id: 'desc' },
    select: {
      id: true,
      internId: true,             // UUID string
      departmentId: true,
      positionId: true,
      startDate: true,
      endDate: true,
      supervisor: true,
      status: true,               // Prisma enum e.g. 'Active'|'Inactive'
    },
  });

  // Index by internId (keep the most recent only)
  const byIntern = new Map<string, (typeof latest)[number]>();
  for (const row of latest) if (!byIntern.has(row.internId)) byIntern.set(row.internId, row);
  const li = Array.from(byIntern.values());

  // Batch fetch department + position names
  const depIds = Array.from(new Set(li.map((r) => r.departmentId).filter(Boolean))) as number[];
  const posIds = Array.from(new Set(li.map((r) => r.positionId).filter(Boolean))) as number[];

  const [deps, poss] = await Promise.all([
    depIds.length
      ? prisma.department.findMany({ where: { id: { in: depIds } }, select: { id: true, departmentName: true } })
      : Promise.resolve([] as { id: number; departmentName: string }[]),
    posIds.length
      ? prisma.position.findMany({ where: { id: { in: posIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);

  const depName = new Map(deps.map((d) => [d.id, d.departmentName]));
  const posName = new Map(poss.map((p) => [p.id, p.name]));

  // Fetch intern details (full rows to avoid TS select errors across schema variants)
const internIds = li.map((r) => r.internId);
const details = internIds.length
  ? await prisma.internDetail.findMany({
      where: { internId: { in: internIds } },
    })
  : [];
const detailsByIntern = new Map(details.map((d: any) => [d.internId, d]));

// ---- Try to link interns -> portal users ----

// 1) optional link via notifications (ignore if table missing)
let notifByIntern = new Map<string, number>();
try {
  const notifLinks = await prisma.notification.findMany({
    where: { internId: { in: internIds } },
    select: { internId: true, userId: true },
  });
  notifByIntern = new Map(
    notifLinks
      .filter((n: any) => Number.isFinite(n.userId))
      .map((n: any) => [n.internId, Number(n.userId)])
  );
} catch { /* notifications table may not exist; ignore */ }

// 2) fallback: name-based match
function splitName(full?: string) {
  const s = (full || '').trim();
  if (!s) return { first: '', sur: '' };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], sur: '' };
  const sur = parts.pop() as string;
  return { first: parts.join(' '), sur };
}
const wantNames = Array.from(detailsByIntern.values()).map((d: any) => {
  const { first, sur } = splitName(d?.name);
  return { first, sur };
});
const firsts = new Set(wantNames.map((n) => n.first).filter(Boolean));
const surs   = new Set(wantNames.map((n) => n.sur).filter(Boolean));

const candidateUserIds = Array.from(new Set(Array.from(notifByIntern.values())));
const users = await prisma.user.findMany({
  where: {
    OR: [
      candidateUserIds.length ? { id: { in: candidateUserIds } } : undefined,
      firsts.size || surs.size
        ? {
            AND: [
              firsts.size ? { firstName: { in: Array.from(firsts) } } : {},
              surs.size   ? { surname:   { in: Array.from(surs)   } } : {},
            ],
          }
        : undefined,
    ].filter(Boolean) as any,
  },
  select: { id: true, firstName: true, surname: true, companyEmail: true, empId: true, role: true, blocked: true },
});
const usersById   = new Map(users.map((u) => [u.id, u]));
const usersByFull = new Map(
  users.map((u) => [`${(u.firstName||'').trim().toLowerCase()} ${(u.surname||'').trim().toLowerCase()}`, u])
);


// We cannot rely on a users FK from intern_details in your DB.
// So we will not look up portal users here. Keep companyEmail/empId null.
// Compose rows
const rows = li.map((it) => {
  const det: any = detailsByIntern.get(it.internId);

  // prefer notifications link -> user
  const linkedUserId = notifByIntern.get(it.internId);
  let u = linkedUserId ? usersById.get(linkedUserId) : undefined;

  // fallback: name match
  if (!u) {
    const full = (det?.name || '').trim().toLowerCase();
    if (full) u = usersByFull.get(full);
  }

  const name = u ? `${u.firstName} ${u.surname}`.trim() : (det?.name || '(no name)');

  return {
    userId: u?.id ?? null,
    internId: it.internId,
    role: (u?.role as 'intern'|'hr'|'super_admin') ?? 'intern',
    name,
    department: it.departmentId ? depName.get(it.departmentId) ?? null : null,
    position:   it.positionId   ? posName.get(it.positionId)   ?? null : null,
    companyEmail: u?.companyEmail ?? null,
    phone: det?.phone ?? null,
    employeeId: u?.empId ?? null,
    joiningDate: it.startDate ? it.startDate.toISOString() : null,
    leavingDate: it.endDate ? it.endDate.toISOString() : null,
    personalEmail: det?.email ?? '',
    nationality: det?.nationality ?? null,
    dob: det?.birthdate ? det.birthdate.toISOString() : null,
    gender: det?.gender ?? null,
    supervisor: it.supervisor ?? null,
    blocked: !!u?.blocked,
    status: toLowerStatus(it.status as unknown as string),
  };
});



  return rows;
}

/**
 * GET /api/users
 * Returns rows for the admin users page.
 */
router.get('/', ...authorize('hr','super_admin'), enforceNotBlocked, async (_req: Request, res: Response) => {
  const rows = await buildRows();
  res.json(rows);
});


/**
 * GET /api/users/admin/users/:userId/detail
 * Returns a single user's details, including SOS (emergency contact) if present.
 */
router.get( '/admin/users/:userId/detail', ...authorize('hr','super_admin'), enforceNotBlocked, async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid userId' });

    // 1) get the portal user
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        surname: true,
        companyEmail: true,
        role: true,
        empType: true,
        blocked: true, 
      },
    });
    if (!u) return res.status(404).json({ error: 'not_found' });

    // 2) find the intern_detail row for this user:
    //    (a) direct FK via user_id
    //    (b) fallback: match intern_details.email == users.companyEmail
    let det = await prisma.internDetail.findFirst({
      where: { userId: u.id },
      select: {
        internId: true,
        phone: true,
        nationality: true,
        gender: true,
        birthdate: true,
        email: true,
      },
    });
    if (!det && u.companyEmail) {
      det = await prisma.internDetail.findFirst({
        where: { email: u.companyEmail },
        select: {
          internId: true,
          phone: true,
          nationality: true,
          gender: true,
          birthdate: true,
          email: true,
        },
      });
    }

        // (c) final fallback: match by full name, case-insensitive
    if (!det) {
      const full = `${(u.firstName || '').trim()} ${(u.surname || '').trim()}`.trim();
      if (full) {
        det = await prisma.internDetail.findFirst({
          where: { name: { equals: full, mode: 'insensitive' } as any },
          select: {
            internId: true,
            phone: true,
            nationality: true,
            gender: true,
            birthdate: true,
            email: true,
          },
        });
      }
    }


    // 3) latest internship + SOS using internId (works even if user→detail FK is missing)
    let latest: { startDate: Date | null; endDate: Date | null; supervisor: string | null } | null = null;
    let sos: { relation: string | null; phone: string | null } | null = null;

    if (det?.internId) {
      const info = await prisma.internshipInfo.findFirst({
        where: { internId: det.internId },
        orderBy: { startDate: 'desc' },
        select: { startDate: true, endDate: true, supervisor: true },
      });
      latest = info ? {
        startDate: info.startDate ?? null,
        endDate: info.endDate ?? null,
        supervisor: info.supervisor ?? null,
      } : null;

      const sosRow = await prisma.internsSosDetail.findFirst({
        where: { internId: det.internId },
        orderBy: { id: 'desc' },
        select: {
          relativePhoneNumber: true,
          relationWithIntern: true,
        },
      });
      sos = sosRow ? {
        relation: sosRow.relationWithIntern ?? null,
        phone: sosRow.relativePhoneNumber ?? null,
      } : null;
    }

    return res.json({
      firstName: u.firstName,
      surname: u.surname,
      companyEmail: u.companyEmail,
      role: u.role,
      empType: u.empType,
      blocked: !!u.blocked,


      phone: det?.phone ?? null,
      nationality: det?.nationality ?? null,
      gender: det?.gender ?? null,
      birthdate: det?.birthdate ?? null,
      personalEmail: det?.email ?? null,

      startDate: latest?.startDate ?? null,
      endDate: latest?.endDate ?? null,
      supervisor: latest?.supervisor ?? null,

      sos, // always present in payload; null if none
    });
  }
);

/**
 * GET /api/users/admin/users/detail-by-intern/:internId
 * Returns the same shape, looked up by internId (UUID) only.
 */
router.get(
  '/admin/users/detail-by-intern/:internId', 
  ...authorize('hr','super_admin'), enforceNotBlocked,
  async (req: Request, res: Response) => {
    const internId = String(req.params.internId || '');
    if (!internId) return res.status(400).json({ error: 'invalid internId' });

    // intern detail by internId
    const det = await prisma.internDetail.findUnique({
      where: { internId },
      select: {
        userId: true,
        phone: true,
        nationality: true,
        gender: true,
        birthdate: true,
        email: true,
        internId: true,
      },
    });

    // linked user if present (optional)
    let u: { firstName: string|null; surname: string|null; companyEmail: string|null; role: any; empType: any } | null = null;
    if (det?.userId) {
      const got = await prisma.user.findUnique({
        where: { id: det.userId },
        select: { firstName: true, surname: true, companyEmail: true, role: true, empType: true },
      });
      if (got) u = { ...got };
    }

    // latest internship
    const info = await prisma.internshipInfo.findFirst({
      where: { internId },
      orderBy: { startDate: 'desc' },
      select: { startDate: true, endDate: true, supervisor: true },
    });

    // SOS
    const sosRow = await prisma.internsSosDetail.findFirst({
      where: { internId },
      orderBy: { id: 'desc' },
      select: { relativePhoneNumber: true, relationWithIntern: true },
    });

    return res.json({
      firstName: u?.firstName ?? null,
      surname: u?.surname ?? null,
      companyEmail: u?.companyEmail ?? null,
      role: u?.role ?? null,
      empType: u?.empType ?? null,

      phone: det?.phone ?? null,
      nationality: det?.nationality ?? null,
      gender: det?.gender ?? null,
      birthdate: det?.birthdate ?? null,
      personalEmail: det?.email ?? null,

      startDate: info?.startDate ?? null,
      endDate: info?.endDate ?? null,
      supervisor: info?.supervisor ?? null,

      sos: sosRow ? {
        relation: sosRow.relationWithIntern ?? null,
        phone: sosRow.relativePhoneNumber ?? null,
      } : null,
    });
  }
);





/**
 * POST /api/users/admin/users/deactivate
 * Body: { userId?: number|null, internId?: string|null, companyEmail?: string|null }
 * Action: delete login (users table) if userId present, set internship status to Inactive.
 * Google Workspace removal handled elsewhere if needed.
 */

router.post(
  '/admin/users/deactivate',
  ...authorize('hr','super_admin'), enforceNotBlocked,
  async (req, res, next) => {
    try {
      const { userId, email, companyEmail, internId } = req.body || {};

      // Resolve portal user if we can
      let portalUser: { id: number; companyEmail: string } | null = null;
      if (Number.isFinite(userId)) {
        const u = await prisma.user.findUnique({
          where: { id: Number(userId) },
          select: { id: true, companyEmail: true },
        });
        if (u) portalUser = u;
      } else if (typeof companyEmail === 'string') {
        const u = await prisma.user.findUnique({
          where: { companyEmail: String(companyEmail) },
          select: { id: true, companyEmail: true },
        });
        if (u) portalUser = u;
      } else if (typeof email === 'string') {
        const u = await prisma.user.findUnique({
          where: { companyEmail: String(email) },
          select: { id: true, companyEmail: true },
        });
        if (u) portalUser = u;
      }

      // Decide which internId to use for status updates
      let targetInternId: string | null = typeof internId === 'string' ? internId : null;

      if (!targetInternId && portalUser) {
        const d = await prisma.internDetail.findFirst({
          where: { userId: portalUser.id },
          select: { internId: true },
        });
        targetInternId = d?.internId ?? targetInternId;
      }



      if (!targetInternId && portalUser?.companyEmail) {
        const d = await prisma.internDetail.findFirst({
          where: { email: portalUser.companyEmail },
          select: { internId: true },
        });
        targetInternId = d?.internId ?? null;
      }

      // 1) Inactivate internships even if there is no portal user
      // 1) Inactivate internships even if there is no portal user
let inactivated = 0;
if (targetInternId) {
  const r = await prisma.internshipInfo.updateMany({
    where: {
      internId: targetInternId,
      status: InternshipStatus.Active,      // was "Active"
    },
    data: {
      status: InternshipStatus.Inactive,    // was "Completed" -> NOT in enum
    },
  });
  inactivated += r.count;
}


      // 2) Block the portal user if found
let blockedUsers = 0;
if (portalUser) {
  await prisma.user.update({ where: { id: portalUser.id }, data: { blocked: true } });
  blockedUsers = 1;
}

return res.json({
  ok: true,
  portal: { blockedUsers, inactivatedInternships: inactivated },
});

    } catch (e) { next(e); }
  }
);


router.post('/__probe', (_req,res) => res.json({ ok: true }));

router.post('/create-auto', ...authorize('hr','super_admin'), enforceNotBlocked, async (req, res, next) => {
  // forward to the admin route to avoid code duplication
  (req as any).url = '/provision/auto';
  return (require('./admin').default as any).handle(req, res, next);
});



// PUT /api/users/admin/users
router.put('/admin/users', ...authorize('hr','super_admin'),enforceNotBlocked, async (req, res) => {
  const companyEmail = String(req.body?.companyEmail || '').trim().toLowerCase();
  const empType = String(req.body?.updates?.empType || '');
  if (!companyEmail) return res.status(400).json({ error: 'companyEmail required' });
  if (!['intern','employee','team_lead'].includes(empType)) {
    return res.status(400).json({ error: 'invalid empType' });
  }
  try {
    const u = await prisma.user.update({
      where: { companyEmail },
      data: { empType: empType as any },
      select: { id: true, empType: true },
    });
    return res.json(u);
  } catch {
    return res.status(404).json({ error: 'not_found' });
  }
});


/**
 * PUT /api/users/admin/users/intern/:internId
 * Update internship info + intern detail fields. Optional role change if userId present.
 */
router.put('/admin/users/intern/:internId', ...authorize('hr', 'super_admin'), enforceNotBlocked, async (req: Request, res: Response) => {
  const internId = req.params.internId; // UUID string
  const {
  startDate, endDate, supervisor, departmentId, positionId,
  phone, personalEmail, nationality, gender, birthdate,
  name, userId, role, empType,
} = req.body as {
  startDate?: string | null;
  endDate?: string | null;
  supervisor?: string | null;
  departmentId?: number | null;
  positionId?: number | null;
  phone?: string | null;
  personalEmail?: string | null;
  nationality?: string | null;
  gender?: string | null;
  birthdate?: string | null; // yyyy-mm-dd
  name?: string | null;      // "First Last"
  userId?: number | null;
  role?: 'intern' | 'hr' | 'super_admin' | undefined;
  empType?: 'intern' | 'employee' | 'team_lead' | undefined;
};


  // Update latest internship row(s) for this internId
  await prisma.internshipInfo.updateMany({
    where: { internId },
    data: {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      supervisor: supervisor ?? null,
      departmentId: departmentId ?? null,
      positionId: positionId ?? null,
    },
  });

  // Update intern detail
  await prisma.internDetail.updateMany({
  where: { internId },
  data: {
    phone: phone ?? null,
    email: personalEmail ?? null,   // map request field → DB column
    nationality: nationality ?? null,
    gender: gender ?? null,
    birthdate: birthdate ? new Date(birthdate) : null,
  },
});



  // Optionally update user first/surname, role, and empType
  if (userId && Number.isFinite(userId)) {
    const id = Number(userId);
    const data: any = {};
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      data.firstName = parts.shift() || '';
      data.surname = parts.join(' ') || '';
    }
    if (role) data.role = role;

    // only persist valid empType values
    if (['intern','employee','team_lead'].includes((req.body as any)?.empType)) {
  data.empType = (req.body as any).empType as any;
}

    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id }, data });
    }
  }

  res.json({ ok: true });
});

/**
 * DELETE /api/users/admin/users/intern/:internId
 * Hard-delete inactive intern record (detail + internships).
 */
router.delete('/admin/users/intern/:internId', ...authorize('super_admin'), enforceNotBlocked, async (req: Request, res: Response) => {
  const internId = req.params.internId; // UUID string
  // Only proceed if internships are inactive
    if (await isInternActive(internId)) {
      return res.status(400).json({ error: 'Internship is active' });
    }



  await prisma.internDetail.deleteMany({ where: { internId } });
  await prisma.internshipInfo.deleteMany({ where: { internId } });
  res.json({ ok: true });

});

/**
 * Column config endpoints used by the page.
 * Stored in a single-row KV table for simplicity.
 */
// === Columns config (HR-only selectable) ===
const DEFAULT_SA_COLS = ['name','companyEmail','department','position','startDate','endDate'];
const DEFAULT_HR_COLS = ['name','companyEmail','department','position','startDate','endDate'];

router.get('/admin/users/columns', ...authorize('hr', 'super_admin'), enforceNotBlocked, async (req, res) => {
  const role = (req.user as any)?.role as 'intern'|'hr'|'super_admin';
  const cfg = await prisma.adminUiConfig.findFirst();

  if (role === 'super_admin') {
    return res.json({
      selectable: false,
      cols: DEFAULT_SA_COLS,
      role: 'super_admin',
      version: cfg?.version ?? 1,
      updatedAt: cfg?.updatedAt ?? new Date(),
    });
  }

  const hrCols = (cfg as any)?.hrCols ?? DEFAULT_HR_COLS;
  return res.json({
    selectable: true,
    cols: hrCols,
    role: 'hr',
    version: cfg?.version ?? 1,
    updatedAt: cfg?.updatedAt ?? new Date(),
  });
});

router.put('/admin/users/columns', ...authorize('hr'),enforceNotBlocked, async (req, res) => {
  const { cols } = req.body as { cols: string[] };
  if (!Array.isArray(cols)) return res.status(400).json({ error: 'cols must be string[]' });

  const now = new Date();
  const up = await prisma.adminUiConfig.upsert({
    where: { id: 1 },
    create: { id: 1, hrCols: cols as any, version: 1, updatedAt: now },
    update: { hrCols: cols as any, version: { increment: 1 }, updatedAt: now },
  });
  res.json({ ok: true, version: up.version, updatedAt: up.updatedAt });
});

router.get('/admin/users/columns/version', ...authorize('hr', 'super_admin'),enforceNotBlocked, async (_req, res) => {
  const v = await prisma.adminUiConfig.findFirst({ select: { version: true, updatedAt: true } });
  res.json({ version: v?.version ?? 1, updatedAt: v?.updatedAt ?? new Date() });
});




router.get('/me/summary', ensureAuthenticated as any, enforceNotBlocked, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id as number | undefined;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    // intern detail for this portal user
    const detail = await prisma.internDetail.findFirst({
      where: { userId },
      select: { internId: true },
    });
    if (!detail?.internId) {
      // not an intern
      return res.json({
        status: null, startDate: null, endDate: null,
        department: null, position: null, daysLeft: null,
      });
    }

    // latest internship row
    const info = await prisma.internshipInfo.findFirst({
      where: { internId: detail.internId },
      orderBy: { startDate: 'desc' },
      include: {
        department: { select: { departmentName: true } },
        position: { select: { name: true } },
      },
    });

    if (!info) {
      return res.json({
        status: null, startDate: null, endDate: null,
        department: null, position: null, daysLeft: null,
      });
    }

    const today = new Date();
    const end = info.endDate ? new Date(info.endDate) : null;
    const daysLeft =
      end ? Math.max(0, Math.ceil((+end - +today) / (1000 * 60 * 60 * 24))) : null;

    return res.json({
      status: info.status === 'Active' ? 'active' : 'inactive',
      startDate: info.startDate,
      endDate: info.endDate,
      department: info.department?.departmentName ?? null,
      position: info.position?.name ?? null,
      daysLeft,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});


router.get('/options', ...authorize('hr','super_admin'), enforceNotBlocked, async (req, res) => {
  const q = String(req.query.q ?? '').trim();

const where: Prisma.UserWhereInput | undefined = q
  ? {
      OR: [
        { firstName:   { contains: q, mode: 'insensitive' as Prisma.QueryMode } },
        { surname:     { contains: q, mode: 'insensitive' as Prisma.QueryMode } },
        { companyEmail:{ contains: q, mode: 'insensitive' as Prisma.QueryMode } },
        { empId:       { contains: q, mode: 'insensitive' as Prisma.QueryMode } },
      ],
    }
  : undefined;

const rows = await prisma.user.findMany({
  where,
  select: { id: true, firstName: true, surname: true, role: true, empId: true, companyEmail: true, empType: true },
  orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
  take: 50,
});
res.json(rows);
});


// PATCH /api/users/:id/block  — revoke access
router.patch('/:id/block', ensureAuthenticated as any, async (req, res) => {
  const meId = Number((req as any).user?.id);
  if (!meId) return res.status(401).json({ error: 'unauthorized' });
  const me = await prisma.user.findUnique({ where: { id: meId }, select: { role: true } });
  if (me?.role !== 'super_admin') return res.status(403).json({ error: 'forbidden' });

  const id = Number(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, companyEmail: true } });
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'super_admin') return res.status(400).json({ error: 'cannot_block_super_admin' });

  const u = await prisma.user.update({ where: { id }, data: { blocked: true }, select: { companyEmail: true } });

  // notify only
  try {
    const { sendAccessRevokedNotice } = await import('../lib/mailer');
    if (u.companyEmail) await sendAccessRevokedNotice({ to: u.companyEmail });
  } catch {}

  res.json({ ok: true });
});


// PATCH /api/users/:id/unblock
router.patch('/:id/unblock', ensureAuthenticated, async (req, res) => {
  const meId = Number((req as any).user?.id);
  if (!meId) return res.status(401).json({ error: 'unauthorized' });

  const me = await prisma.user.findUnique({ where: { id: meId }, select: { role: true } });
  if (me?.role !== 'super_admin') return res.status(403).json({ error: 'forbidden' });

  const id = Number(req.params.id);
  const u = await prisma.user.update({
    where: { id },
    data: { blocked: false },
    select: { id: true, companyEmail: true },
  });

  // notify
  try {
    const { sendAccessRestoredNotice } = await import('../lib/mailer');
    if (u.companyEmail) await sendAccessRestoredNotice({ to: u.companyEmail });
  } catch {}

  res.json({ ok: true });
});


// PATCH /api/users/:id/restore  (kept as alias to unblock for backward compatibility)
router.patch('/:id/restore', ensureAuthenticated, async (req, res) => {
  const meId = Number((req as any).user?.id);
  if (!meId) return res.status(401).json({ error: 'unauthorized' });

  const me = await prisma.user.findUnique({ where: { id: meId }, select: { role: true } });
  if (me?.role !== 'super_admin') return res.status(403).json({ error: 'forbidden' });

  const id = Number(req.params.id);

  const u = await prisma.user.update({
    where: { id },
    data: { blocked: false },
    select: { id: true, companyEmail: true },
  });

  try {
    const { sendAccessRestoredNotice } = await import('../lib/mailer');
    if (u.companyEmail) await sendAccessRestoredNotice({ to: u.companyEmail });
  } catch {}

  return res.json({ ok: true });
});



// POST /api/users/admin/revoke
router.post('/admin/revoke', ...authorize('super_admin'),enforceNotBlocked, async (req, res) => {
  const { userId, companyEmail } = (req.body || {}) as {
    userId?: number;
    companyEmail?: string;
  };

  // Resolve portal user
  let u: { id: number; companyEmail: string | null } | null = null;
  if (Number.isFinite(userId)) {
    u = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { id: true, companyEmail: true } });
  } else if (companyEmail) {
    u = await prisma.user.findUnique({ where: { companyEmail }, select: { id: true, companyEmail: true } });
  }
  if (!u) return res.status(404).json({ error: 'user_not_found' });

  // Block user
  await prisma.user.update({ where: { id: u.id }, data: { blocked: true } });

  // Optional: mark known devices untrusted
  await prisma.knownDevice.updateMany({ where: { userId: u.id }, data: { trusted: false } }).catch(() => {});

  // Notify
  try {
    const { sendAccessRevokedNotice } = await import('../lib/mailer');
    if (u.companyEmail) await sendAccessRevokedNotice({ to: u.companyEmail });
  } catch {}

  return res.json({ ok: true, portal: { blockedUsers: 1 } });
});



// POST /api/users/admin/restore  — restore access by id or email
router.post('/admin/restore', ...authorize('super_admin'), async (req, res) => {
  const { userId, companyEmail } = (req.body || {}) as {
    userId?: number;
    companyEmail?: string;
  };

  // Resolve portal user
  let u: { id: number; companyEmail: string | null } | null = null;
  if (Number.isFinite(userId)) {
    u = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { id: true, companyEmail: true } });
  } else if (companyEmail) {
    u = await prisma.user.findUnique({ where: { companyEmail }, select: { id: true, companyEmail: true } });
  }
  if (!u) return res.status(404).json({ error: 'user_not_found' });

  // Unblock user
  await prisma.user.update({ where: { id: u.id }, data: { blocked: false } });

  // Optional: unsuspend Google Workspace
  try {
    const { unsuspendUserByEmail } = await import('../google/admin');
    if (u.companyEmail && typeof unsuspendUserByEmail === 'function') {
      await unsuspendUserByEmail(u.companyEmail);
    }
  } catch {}

  // Notify
  try {
    const { sendAccessRestoredNotice } = await import('../lib/mailer');
    if (u.companyEmail) await sendAccessRestoredNotice({ to: u.companyEmail });
  } catch {}

  return res.json({ ok: true, portal: { unblockedUsers: 1 } });
});




export default router;
