  // backend/src/routes/admin.ts
  import { Router } from 'express';
  import type { Request, Response } from 'express';
  import prisma from '../prisma';
  import { logDocumentAction } from '../lib/documentLogger';
  import { authorize } from '../middleware/authorize';
  import { getMailer, sendMail, sendTemplateMail } from '../lib/mailer';
  import { randomBytes, createHash } from 'crypto';
  import gsuiteRouter from './gsuite';
  import ensureAuthenticated from '../middleware/ensureAuthenticated';
  import { $Enums } from '@prisma/client';
  import { deleteDriveFile } from '../google/drive';
  import { extractDriveId } from '../google/deletion';

  import multer from 'multer';
  import bcrypt from 'bcryptjs';
  import { parse } from 'csv-parse/sync';

  import { runDocumentDeletionCycle } from '../lib/deprovision';
  import { getSystemConfig, invalidateSystemConfigCache } from '../lib/systemConfig';


  const router = Router();
  const REQUIRED_DOCS = [
    'ACCEPTANCE_LETTER',
    'LEARNING_AGREEMENT',
    'ID_PASSPORT',
    'CV',
  ] as const;

  // CSV employee import configuration (in-memory upload, 2 MB limit)

const upload = multer({
  storage: multer.memoryStorage(),            // keep file in RAM, not on disk
  limits: { fileSize: 5 * 1024 * 1024 },      // max ~5MB per upload
});

// Fields that the UI can map columns to
const IMPORT_FIELDS = [
  { id: 'firstName',    label: 'First Name',    required: true  },
  { id: 'surname',      label: 'Surname',       required: true  },
  { id: 'personalEmail', label: 'Personal Email', required: true },
  { id: 'nationality',  label: 'Nationality',   required: false },
  { id: 'gender',       label: 'Gender',        required: false },
  { id: 'phone',        label: 'Phone',         required: false },
  { id: 'birthdate',    label: 'Birthdate',     required: false },
  { id: 'department',   label: 'Department',    required: true  },
  { id: 'position',     label: 'Position',      required: true  },
  { id: 'startDate',    label: 'Start Date',    required: true  },
  { id: 'endDate',      label: 'End Date',      required: false },
  { id: 'empType',      label: 'Employee Type', required: true  }, // intern/employee/team_lead
  { id: 'supervisor',   label: 'Supervisor',    required: false },
  { id: 'companyEmail',  label: 'Company Email',  required: false },
] as const;



  // ---------------------------------------------------------------------------
  // SystemConfig summary (for frontend usage)
  // GET /api/admin/system-config/summary
  // Returns only the fields needed for UI (no secrets)
  // ---------------------------------------------------------------------------
  router.get(
    '/system-config/summary',
    ensureAuthenticated as any,
    ...authorize('hr', 'super_admin'),
    async (_req: Request, res: Response) => {
      try {
        const sys = await getSystemConfig();
        res.json({
          companyEmailDomain: sys.companyEmailDomain,
          googleWorkspaceDomain: sys.googleWorkspaceDomain,
          googleAllGroup: sys.googleAllGroup,
        });
      } catch (e: any) {
        res.status(500).json({ error: e?.message || 'Failed to load system config' });
      }
    }
  );
  // ---------------------------------------------------------------------------

  // normalize avatar filePath → public URL that <img> can load
  // normalize avatar filePath → our authenticated proxy URL
  const normalizeAvatarUrl = (p?: string | null) => {
    if (!p) return null;
    // already our proxy?
    const m3 = p.match(/\/api\/uploads\/drive\/file\/([^/?]+)/);
    if (m3) return `/api/uploads/drive/file/${encodeURIComponent(m3[1])}?name=avatar`;
    // google drive to proxy
    const m1 = p.match(/[?&]id=([^&]+)/);
    if (m1) return `/api/uploads/drive/file/${encodeURIComponent(decodeURIComponent(m1[1]))}?name=avatar`;
    const m2 = p.match(/\/file\/d\/([^/]+)/);
    if (m2) return `/api/uploads/drive/file/${encodeURIComponent(m2[1])}?name=avatar`;
    // other http(s) – return as-is
    if (/^https?:\/\//i.test(p)) return p;
    return null;
  };





  // Required document types
  const DOC_REQUIRED: $Enums.DocumentType[] = [
    'ACCEPTANCE_LETTER', 'LEARNING_AGREEMENT', 'ID_PASSPORT', 'CV'
  ];

  // UI kind → Prisma enum
  const KIND_TO_ENUM: Record<string, $Enums.DocumentType> = {
    cv: 'CV',
    passport_id: 'ID_PASSPORT',
    acceptance_letter: 'ACCEPTANCE_LETTER',
    learning_agreement: 'LEARNING_AGREEMENT',
  };


  const driveFileIdFromPath = (p?: string | null) => {
    if (!p) return null;
    const m3 = p.match(/\/api\/uploads\/drive\/file\/([^/?]+)/); if (m3) return m3[1];
    const m1 = p.match(/[?&]id=([^&]+)/);                        if (m1) return decodeURIComponent(m1[1]);
    const m2 = p.match(/\/file\/d\/([^/]+)/);                     if (m2) return m2[1];
    if (/^[A-Za-z0-9_-]{10,}$/.test(p)) return p; // plain id
    return null;
  };



  // delete one InternDocument row (Drive + DB)
  async function deleteOneInternDocument(doc: { id:number; filePath:string|null }) {
    const fileId = extractDriveId(doc.filePath || '') || '';
    if (fileId) { await deleteDriveFile(fileId); }
    await prisma.internDocument.delete({ where: { id: doc.id } });
  }

  // delete all four required docs for an intern
  async function deleteAllRequiredDocsForIntern(internId: string) {
    const docs = await prisma.internDocument.findMany({
      where: { internId, documentType: { in: DOC_REQUIRED }, isActive: true },
      select: { id: true, filePath: true }
    });

    let driveDeleted = 0;
    for (const d of docs) {
      const fileId = extractDriveId(d.filePath || '') || '';
      if (!fileId) { driveDeleted += 1; continue; }      // treat as OK if no id
      const ok = await deleteDriveFile(fileId);
      if (ok) driveDeleted += 1;
    }
    if (docs.length) {
      await prisma.internDocument.deleteMany({ where: { id: { in: docs.map(d => d.id) } } });
    }
    return { rows: docs.length, driveDeleted };
  }

  function addDays(base: Date, n: number) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function toDays(amount = 0, unit: 'days'|'weeks'|'months' = 'days') {
    if (unit === 'weeks') return amount * 7;
    if (unit === 'months') return amount * 30;
    return amount;
  }

  // Full SystemConfig (for configuration UI)
  // GET /api/admin/system-config
  router.get(
    '/system-config',
    ensureAuthenticated as any,
    ...authorize('super_admin'),
    async (_req: Request, res: Response) => {
      try {
        // ensure row id=1 exists
        const row = await prisma.systemConfig.upsert({
          where: { id: 1 },
          update: {},
          create: { id: 1 },
        });
        res.json(row);
      } catch (e: any) {
        res.status(500).json({ error: e?.message || 'Failed to load system config' });
      }
    }
  );


  // PUT /api/admin/system-config
  // Body: any subset of the SystemConfig fields
  router.put(
    '/system-config',
    ensureAuthenticated as any,
    ...authorize('super_admin'),
    async (req: Request, res: Response) => {
      try {
        const b = req.body ?? {};
        const data: any = {};

        if ('companyEmailDomain' in b)
          data.companyEmailDomain = b.companyEmailDomain || null;
        if ('googleWorkspaceDomain' in b)
          data.googleWorkspaceDomain = b.googleWorkspaceDomain || null;
        if ('googleAdminSubject' in b)
          data.googleAdminSubject = b.googleAdminSubject || null;
        if ('googleSharedDriveId' in b)
          data.googleSharedDriveId = b.googleSharedDriveId || null;
        if ('googleAllGroup' in b)
          data.googleAllGroup = b.googleAllGroup || null;

        if ('googleSheetsSpreadsheetId' in b)
          data.googleSheetsSpreadsheetId = b.googleSheetsSpreadsheetId || null;
        if ('googleSheetsClientEmail' in b)
          data.googleSheetsClientEmail = b.googleSheetsClientEmail || null;
        if ('googleSheetsPrivateKey' in b)
          data.googleSheetsPrivateKey = b.googleSheetsPrivateKey || null;
        if ('googleSheetsExtraHours' in b)
          data.googleSheetsExtraHours = b.googleSheetsExtraHours || null;
        if ('googleSheetsAbsence' in b)
          data.googleSheetsAbsence = b.googleSheetsAbsence || null;

        if ('maxmindAccountId' in b)
          data.maxmindAccountId = b.maxmindAccountId || null;
        if ('maxmindEditionIds' in b)
          data.maxmindEditionIds = b.maxmindEditionIds || null;
        if ('geoipDbDir' in b)
          data.geoipDbDir = b.geoipDbDir || null;

        if (Object.keys(data).length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        data.updatedBy = (req as any)?.user?.id ?? null; // optional audit

        await prisma.systemConfig.upsert({
          where: { id: 1 },
          update: data,
          create: { id: 1, ...data },
        });

        // Clear cached config so next request sees new values
        invalidateSystemConfigCache();

        const row = await prisma.systemConfig.findUnique({ where: { id: 1 } });
        res.json(row);
      } catch (e: any) {
        res.status(500).json({ error: e?.message || 'Failed to update system config' });
      }
    }
  );


  router.post(
    '/provision/auto',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    (req, res) => {
      // reuse the existing GSuite router implementation
      (gsuiteRouter as any).handle({ ...req, url: '/provision/auto', method: 'POST' }, res);
    }
  );

  type Role = 'intern' | 'hr' | 'super_admin';
  type InternshipStatus = $Enums.InternshipStatus; // 'Active' | 'Inactive'

  interface UserLite {
    id: number;
    firstName: string;
    surname: string;
    role: Role;
    companyEmail: string;
    empId: string | null;
  }

  interface DetailLite {
    internId: string;             // UUID
    userId: number | null;
    email: string | null;
    nationality: string | null;
    gender: string | null;
    birthdate: Date | null;
    phone: string | null;
  }

  interface InfoLite {
    id: number;
    internId: string;
    departmentId: number | null;
    positionId: number | null;
    startDate: Date | null;
    endDate: Date | null;
    supervisor: string | null;
    status: InternshipStatus;
    department: { departmentName: string } | null;
    position: { name: string } | null;
  }



  /**
   * GET /api/admin/users
   * Active: portal users + latest internship row with status Active.
   * Inactive: latest internship row with status Completed, even if portal user missing.
   */
  router.get('/users',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req: Request, res: Response) => {
    try {
      const tab = (String(req.query.tab || 'active') as 'active' | 'inactive');
      const q = String(req.query.q || '').trim().toLowerCase();

      const matches = (row: any) =>
        [row.firstName, row.surname, row.companyEmail, row.personalEmail, row.department, row.position, row.empId]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(q));

      if (tab === 'inactive') {
    const rowsRaw = await prisma.internshipInfo.findMany({
    where: { status: 'Inactive' },          // Prisma expects 'Inactive'
    orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
    include: {
      department: { select: { departmentName: true } },
      position:   { select: { name: true } },
      intern: { include: { user: { select: { id:true, firstName:true, surname:true, role:true, companyEmail:true, empId:true } } } },
    },
  });

  const seen = new Set<string>();
  const latest: InfoLite[] = [];
  for (const r of rowsRaw) if (!seen.has(r.internId)) { seen.add(r.internId); latest.push(r); }

  // Avatars for these inactive interns
  const inactiveInternIds = latest.map(i => i.internId);
  const inactiveAvRows = inactiveInternIds.length
    ? await prisma.internDocument.findMany({
        where: { internId: { in: inactiveInternIds }, documentType: 'PROFILE_PICTURE', isActive: true },
        select: { internId: true, filePath: true },
      })
    : [];
  const inactiveAvatarByIntern = new Map(
    inactiveAvRows.map(r => [r.internId, normalizeAvatarUrl(r.filePath)])
  );


  let rows = latest.map((i: InfoLite) => {
    const u = (i as any).intern?.user as (UserLite|undefined); // select came via include
    const name = (u ? `${u.firstName} ${u.surname}` : ((i as any).intern?.name || '')).trim();
    const [firstName, ...rest] = name.split(/\s+/);
    const surname = rest.join(' ');
    return {
      avatarUrl: inactiveAvatarByIntern.get(i.internId) ?? null,
      kind: 'intern' as const,
      id: u?.id ?? 0,
      userId: u?.id ?? null,
      internId: i.internId,
      name: u ? `${u.firstName} ${u.surname}`.trim()
              : ((i as any).intern?.name || ''),
      firstName,
      surname,
      role: (u?.role ?? 'intern') as Role,
      companyEmail: u?.companyEmail ?? null,
      personalEmail: (i as any).intern?.email ?? null,
      department: i.department?.departmentName ?? null,
      position:   i.position?.name ?? null,
      startDate:  i.startDate ?? null,
      endDate:    i.endDate ?? null,
      joiningDate: i.startDate ?? null,            // ← add
      leavingDate: i.endDate ?? null,  
      status: 'inactive',
      nationality: (i as any).intern?.nationality ?? null,
      gender: (i as any).intern?.gender ?? null,
      birthdate: (i as any).intern?.birthdate ?? null,
      dob: (i as any).intern?.birthdate ?? null,
      phone: (i as any).intern?.phone ?? null,
      supervisor: i.supervisor ?? null,
      empId: u?.empId ?? null,
      employeeId: u?.empId ?? null,
    };
  });




    if (q) rows = rows.filter(matches);

    // attach avatarUrl for these interns
  {
    const ids = Array.from(new Set(
      rows.filter(r => r.internId).map(r => r.internId as string)
    ));
    const pics = ids.length ? await prisma.internDocument.findMany({
      where: { internId: { in: ids }, documentType: 'PROFILE_PICTURE', isActive: true },
      select: { internId: true, filePath: true },
    }) : [];
    const picMap = new Map(pics.map(p => [p.internId, normalizeAvatarUrl(p.filePath)]));
    rows = rows.map(r => r.internId ? { ...r, avatarUrl: picMap.get(r.internId) ?? null } : r);
  }

    return res.json(rows);
  }



      // === ACTIVE (default): one row per Active internship ===
  {
    const rowsRaw = await prisma.internshipInfo.findMany({
      where: { status: 'Active' },
      orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
      include: {
        department: { select: { departmentName: true } },
        position:   { select: { name: true } },
        intern: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                surname: true,
                role: true,
                companyEmail: true,   // per-intern portal email
                empId: true,
                empType: true,
                blocked: true,
              },
            },
          },
        },
      },
    });

    // keep latest row per internId
    const seen = new Set<string>();
    const latest = [];
    for (const r of rowsRaw) {
      if (!seen.has(r.internId)) { seen.add(r.internId); latest.push(r); }
    }

    // avatars
    const avRows = latest.length
      ? await prisma.internDocument.findMany({
          where: {
            internId: { in: latest.map(r => r.internId) },
            documentType: 'PROFILE_PICTURE',
            isActive: true,
          },
          select: { internId: true, filePath: true },
        })
      : [];
    const avatarByIntern = new Map(avRows.map(a => [a.internId, normalizeAvatarUrl(a.filePath)]));

    let rows = latest.map(i => {
      const u = i.intern?.user ?? null;
      const fullName = u ? `${u.firstName} ${u.surname}`.trim() : (i.intern?.name || '').trim();

      return {
        kind: 'intern' as const,
        avatarUrl: avatarByIntern.get(i.internId) ?? null,

        id: u?.id ?? 0,  
        userId: u?.id ?? null,
        internId: i.internId,

        name: fullName,
        firstName: u?.firstName ?? fullName.split(' ')[0] ?? '',
        surname: u?.surname ?? fullName.split(' ').slice(1).join(' ') ?? '',

        role: (u?.role ?? 'intern') as Role,
        companyEmail: u?.companyEmail ?? null,     // <-- fixes duplicate email issue
        personalEmail: i.intern?.email ?? null,

        department: i.department?.departmentName ?? null,
        position:   i.position?.name ?? null,
        startDate:  i.startDate ?? null,
        endDate:    i.endDate ?? null,
        joiningDate: i.startDate ?? null,
        leavingDate: i.endDate ?? null,
        status: 'active',

        nationality: i.intern?.nationality ?? null,
        gender: i.intern?.gender ?? null,
        birthdate: i.intern?.birthdate ?? null,
        dob: i.intern?.birthdate ?? null,
        phone: i.intern?.phone ?? null,
        supervisor: i.supervisor ?? null,

        empId: u?.empId ?? null,
        employeeId: u?.empId ?? null,
        blocked: !!u?.blocked,
        empType: u?.empType ?? null,
      };
    });

    

    if (q) rows = rows.filter((row: any) =>
      [row.firstName, row.surname, row.companyEmail, row.personalEmail, row.department, row.position, row.empId]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q))
    );

    return res.json(rows);
  }



    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load users' });
    }
  });


  // GET /api/admin/documents/expiring-passports?months=1..6
router.get(
  '/documents/expiring-passports',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const raw = parseInt(String(req.query.months ?? '1'), 10);
      const months = Number.isFinite(raw) ? Math.min(6, Math.max(1, raw)) : 1;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const end = new Date(today);
      end.setMonth(end.getMonth() + months);
      end.setHours(23, 59, 59, 999);

      const docs = await prisma.internDocument.findMany({
        where: {
          documentType: $Enums.DocumentType.ID_PASSPORT,
          isActive: true,
          expiryDate: {
            not: null,
            gte: today,
            lte: end,
          },
        },
        include: {
          intern: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  companyEmail: true,
                },
              },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      const rows = docs.map(d => {
        const expiry = d.expiryDate as Date;
        const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        const user = d.intern.user;
        const displayName =
          (user ? `${user.firstName} ${user.surname}`.trim() : '') || d.intern.name || d.intern.email || 'Unknown';

        return {
          internId: d.internId,
          userId: d.intern.userId,
          displayName,
          companyEmail: user?.companyEmail ?? d.intern.email ?? null,
          expiryDate: d.expiryDate,
          daysLeft,
          filePath: d.filePath, // used to open the doc
        };
      });

      return res.json({ months, count: rows.length, rows });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to load expiring passports' });
    }
  }
);


  // GET /api/stats/missing-docs
  router.get(
    '/stats/missing-docs',
    ensureAuthenticated,
    ...authorize('hr', 'super_admin'),
    async (req, res) => {
      try {
        // 1) honor whitelist (skip docs)
        const blocked = await prisma.reminderWhitelist.findMany({
          where: { skipDocs: true },
          select: { userId: true },
        });
        const blockedSet = new Set(blocked.map(w => w.userId));

        // 2) pull only users that have at least one intern profile
        //    and consistently pick ONE profile (latest by internId)
        const users = await prisma.user.findMany({
          where: { internDetails: { some: {} } },
          select: {
            id: true,
            internDetails: {
              select: {
                internId: true,
                internDocuments: {
                  select: { documentType: true, status: true, isActive: true },
                },
              },
              orderBy: { internId: 'desc' }, // if you have createdAt, prefer: { createdAt: 'desc' }
              take: 1,
            },
          },
        });

        let count = 0;
        const breakdown: Record<string, number> = {};

        for (const u of users) {
          if (blockedSet.has(u.id)) continue;

          const det = u.internDetails[0];
          if (!det) continue;

          const uploaded = new Set(
            det.internDocuments
              .filter(d => d.isActive && d.status !== 'rejected')
              .map(d => d.documentType)
          );

          const missing = REQUIRED_DOCS.filter(t => !uploaded.has(t));
          if (missing.length > 0) {
            count += 1;
            for (const m of missing) breakdown[m] = (breakdown[m] || 0) + 1;
          }
        }

        // optional debug to verify what backend sees
        if (req.query.dbg === '1') {
          return res.json({ count, breakdown, usersScanned: users.length, blocked: blocked.length });
        }

        return res.json({ count, breakdown });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'failed' });
      }
    }
  );



  // ===== Doc summary for filtering on the UI =====
  // GET /api/admin/users/docs-summary?ids=<comma-separated internIds>
  // Returns: { byIntern: { [internId]: { acc:boolean, la:boolean, pid:boolean, cv:boolean, missingAny:boolean } } }
  router.get(
    '/users/docs-summary',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const idsParam = String(req.query.ids || '').trim();
        let internIds: string[] = [];

        if (idsParam) {
          internIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          // Fallback: all active interns
          const act = await prisma.internshipInfo.findMany({
            where: { status: 'Active' },
            select: { internId: true },
            distinct: ['internId'],
          });
          internIds = act.map(r => r.internId);
        }

        if (!internIds.length) return res.json({ byIntern: {} });

        const rows = await prisma.internDocument.findMany({
          where: {
            internId: { in: internIds },
            isActive: true,
            documentType: { in: ['ACCEPTANCE_LETTER','LEARNING_AGREEMENT','ID_PASSPORT','CV'] as any },
          },
          select: { internId: true, documentType: true },
        });

        const by = new Map<string, { acc:boolean; la:boolean; pid:boolean; cv:boolean }>();
        for (const id of internIds) by.set(id, { acc:false, la:false, pid:false, cv:false });
        for (const r of rows) {
          const m = by.get(r.internId);
          if (!m) continue;
          if (r.documentType === 'ACCEPTANCE_LETTER') m.acc = true;
          if (r.documentType === 'LEARNING_AGREEMENT') m.la  = true;
          if (r.documentType === 'ID_PASSPORT')       m.pid = true;
          if (r.documentType === 'CV')                m.cv  = true;
        }
        const out: any = {};
        for (const [id, m] of by) out[id] = { ...m, missingAny: !(m.acc && m.la && m.pid && m.cv) };
        res.json({ byIntern: out });
      } catch (e:any) {
        res.status(500).json({ error: e?.message || 'failed' });
      }
    }
  );



  // GET /api/admin/stats/active-people
  router.get(
    '/stats/active-people',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (_req, res) => {
      try {
        const rows = await prisma.user.groupBy({
          by: ['empType'],
          _count: { empType: true },
        });

        let interns = 0, employees = 0, teamLeads = 0;
        for (const r of rows as any[]) {
          const k = String(r.empType || '').toLowerCase();
          if (k === 'intern')     interns   = r._count.empType;
          if (k === 'employee')   employees = r._count.empType;
          if (k === 'team_lead')  teamLeads = r._count.empType;
        }

        return res.json({ interns, employees, teamLeads, owners: 0 }); // owners kept for backward-compat
      } catch (e:any) {
        try {
          const [i, e1, tl] = await Promise.all([
            prisma.user.count({ where: { empType: 'intern'     as any } }),
            prisma.user.count({ where: { empType: 'employee'   as any } }),
            prisma.user.count({ where: { empType: 'team_lead'  as any } }),
          ]);
          return res.json({ interns: i, employees: e1, teamLeads: tl, owners: 0 });
        } catch (err:any) {
          return res.status(500).json({ error: err?.message || 'failed' });
        }
      }
    }
  );







  /**
   * Detail for editor by portal user id.
   */
  router.get('/users/:id/detail', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true,firstName: true, surname: true, role: true, companyEmail: true, empType: true  },
  });
  if (!u) return res.status(404).json({ error: 'user not found' });

  const d = await prisma.internDetail.findFirst({
    where: { userId: id },
    select: { internId: true, nationality: true, gender: true, birthdate: true, email: true, phone: true },
  });
  const i = d ? await prisma.internshipInfo.findFirst({
    where: { internId: d.internId },
    orderBy: { startDate: 'desc' },
  }) : null;

  res.json({
    firstName: u.firstName,
    surname: u.surname,
    role: u.role,
    companyEmail: u.companyEmail,
    empType: u.empType,
    nationality: d?.nationality ?? null,
    gender: d?.gender ?? null,
    birthdate: d?.birthdate ?? null,
    personalEmail: d?.email ?? null,
    phone: d?.phone ?? null,
    supervisor: i?.supervisor ?? null,
    startDate: i?.startDate ?? null,
    endDate: i?.endDate ?? null,
    status: i?.status ?? null,
  });

    } catch {
      res.status(500).json({ error: 'Failed to load detail' });
    }
  });

  /**
   * PUT /api/admin/users
   * Update user, intern_detail, and latest internship row.
   * Body: { companyEmail?: string, personalEmail?: string, updates: {...} }
   */
  router.put('/users', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
    try {
      const { companyEmail, personalEmail, updates } = req.body as {
        companyEmail?: string | null;
        personalEmail?: string | null;
        updates: any;
      };

      // resolve user + intern detail
      let user = null as Awaited<ReturnType<typeof prisma.user.findUnique>> | null;
      let detail = null as Awaited<ReturnType<typeof prisma.internDetail.findFirst>> | null;

      if (companyEmail) {
        user = await prisma.user.findUnique({ where: { companyEmail } });
        if (user) detail = await prisma.internDetail.findFirst({ where: { userId: user.id } });
      }
      if (!detail && personalEmail) {
        detail = await prisma.internDetail.findFirst({ where: { email: personalEmail } });
        if (detail) user = await prisma.user.findUnique({ where: { id: detail.userId ?? -1 } });
      }
      if (!detail && !user) return res.status(400).json({ error: 'User not found' });

      // update user (+empType)
  if (user) {
    let newEmpType: $Enums.EmpType | undefined;
    if (
      updates?.empType === 'intern' ||
      updates?.empType === 'employee' ||
      updates?.empType === 'team_lead'
    ) {
      newEmpType = updates.empType as $Enums.EmpType;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: updates.firstName ?? undefined,
        surname: updates.surname ?? undefined,
        companyEmail: updates.companyEmail ?? undefined,
        role: updates.role ?? undefined,
        empType: newEmpType, // only applied if valid
      },
    });
  }


      // upsert intern_detail by internId (uuid)
      if (detail?.internId) {
        await prisma.internDetail.update({
          where: { internId: detail.internId },
          data: {
            name: `${updates.firstName ?? user?.firstName ?? ''} ${updates.surname ?? user?.surname ?? ''}`.trim() || undefined,
            nationality: updates.nationality ?? undefined,
            gender: updates.gender ?? undefined,
            birthdate: updates.birthdate ? new Date(updates.birthdate) : undefined,
            email: updates.personalEmail ?? undefined,
            phone: updates.phone ?? undefined,
            userId: user?.id ?? undefined,
          },
        });
      }

      // latest internship_info
      if (detail?.internId) {
        const latest = await prisma.internshipInfo.findFirst({
          where: { internId: detail.internId },
          orderBy: { startDate: 'desc' },
        });
        if (latest) {
          await prisma.internshipInfo.update({
            where: { id: latest.id },
            data: {
              startDate: updates.startDate ? new Date(updates.startDate) : undefined,
              endDate: updates.endDate ? new Date(updates.endDate) : undefined,
              supervisor: updates.supervisor ?? undefined,
              status: updates.status ?? undefined, // must be 'Active' | 'Completed' | 'Rejected'
            },
          });
        }
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Update failed' });
    }
  });

  // ___________________________________________________________________________________________________


  // POST /api/admin/users/deactivate
  // Active tab -> mark latest internships Inactive and delete the portal user
  router.post(
    '/users/deactivate',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req: Request, res: Response) => {
      try {
        const { userId, internId, companyEmail } = (req.body ?? {}) as {
          userId?: number | null;
          internId?: string | null;
          companyEmail?: string | null;
        };

        // Resolve user + intern detail
        let user = null as Awaited<ReturnType<typeof prisma.user.findUnique>> | null;
        let detail = null as Awaited<ReturnType<typeof prisma.internDetail.findFirst>> | null;

        if (userId) user = await prisma.user.findUnique({ where: { id: Number(userId) } });
        if (!user && companyEmail) user = await prisma.user.findUnique({ where: { companyEmail } });
        if (!detail && internId) detail = await prisma.internDetail.findFirst({ where: { internId } });
        if (!detail && user) detail = await prisma.internDetail.findFirst({ where: { userId: user.id } });

        if (!user && !detail) return res.status(400).json({ error: 'User not found' });


        // Require endDate before deprovisioning an intern
const iid = detail?.internId ?? null;

if (iid) {
  const hasEndDate = await prisma.internshipInfo.findFirst({
    where: { internId: iid, endDate: { not: null } },
    select: { id: true },
  });

  if (!hasEndDate) {
    return res.status(400).json({ ok: false, error: 'end_date_required', internId: iid });
  }
}


        // Deactivate internships + delete portal user
        const txRes = await prisma.$transaction(async (tx) => {
          const inactivated = iid
            ? await tx.internshipInfo.updateMany({
                where: { internId: iid },
                data: { status: 'Inactive' },
              })
            : { count: 0 };

          if (user) {
            await tx.user.delete({ where: { id: user.id } }).catch(() => {});
          }

          return { inactivated: inactivated.count, deletedUsers: user ? 1 : 0, internId: iid };
        });

        return res.json({ ok: true, portal: txRes });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'Deactivate failed' });
      }
    }
  );





  // ___________________________________________________________________________________________________





  // ---- Document & Avatar deletion (Admin) ----
  const ALLOWED_DOC_TYPES = ['ACCEPTANCE_LETTER','LEARNING_AGREEMENT','ID_PASSPORT','CV'] as const;

  async function safeDeleteDriveByFilePath(filePath?: string | null) {
    const id = extractDriveId(String(filePath || ''));
    if (!id) return false;
    try { return await deleteDriveFile(id); } catch { return false; }
  }

  // POST /api/admin/documents/delete  { internId, documentType }
  router.post(
    '/documents/delete',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const { internId, documentType } = (req.body || {}) as {
          internId?: string;
          documentType?: typeof ALLOWED_DOC_TYPES[number];
        };
        if (!internId) return res.status(400).json({ error: 'internId required' });
        if (!documentType || !ALLOWED_DOC_TYPES.includes(documentType)) {
          return res.status(400).json({ error: 'invalid documentType' });
        }

        const rows = await prisma.internDocument.findMany({
          where: { internId, documentType, isActive: true },
          select: { id: true, filePath: true, fileName: true, originalName: true, expiryDate: true },
        });

        // Get intern info for logging
        const internDetail = await prisma.internDetail.findUnique({
          where: { internId },
          select: { name: true, userId: true },
        });

        // Map document type to kind for logging
        const docTypeToKind: Record<string, string> = {
          'ACCEPTANCE_LETTER': 'acceptance_letter',
          'LEARNING_AGREEMENT': 'learning_agreement',
          'ID_PASSPORT': 'passport_id',
          'CV': 'cv',
        };
        const kind = docTypeToKind[documentType] || documentType.toLowerCase();

        // Attempt Drive deletes (best-effort)
        await Promise.allSettled(rows.map(r => safeDeleteDriveByFilePath(r.filePath)));

        // Remove DB rows
        const del = await prisma.internDocument.deleteMany({
          where: { id: { in: rows.map(r => r.id) } },
        });

        // Log deletion for each document
        const actor = (req as any).user as { id: number };
        for (const row of rows) {
          const fileId = extractDriveId(row.filePath || '') || null;
          await logDocumentAction({
            action: 'delete',
            documentType: kind,
            fileName: row.fileName || row.originalName || `document_${kind}`,
            fileId,
            internId,
            internName: internDetail?.name || null,
            userId: internDetail?.userId || null,
            performedBy: actor.id,
            expiryDate: row.expiryDate || null,
            req,
          });
        }

        return res.json({ ok: true, deleted: del.count });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'delete failed' });
      }
    }
  );

  // POST /api/admin/documents/delete-all  { internId }
  router.post(
    '/documents/delete-all',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const { internId } = (req.body || {}) as { internId?: string };
        if (!internId) return res.status(400).json({ error: 'internId required' });

        const rows = await prisma.internDocument.findMany({
          where: {
            internId,
            isActive: true,
            documentType: { in: ALLOWED_DOC_TYPES as any },
          },
          select: { id: true, filePath: true, fileName: true, originalName: true, documentType: true, expiryDate: true },
        });

        // Get intern info for logging
        const internDetail = await prisma.internDetail.findUnique({
          where: { internId },
          select: { name: true, userId: true },
        });

        // Map document type to kind for logging
        const docTypeToKind: Record<string, string> = {
          'ACCEPTANCE_LETTER': 'acceptance_letter',
          'LEARNING_AGREEMENT': 'learning_agreement',
          'ID_PASSPORT': 'passport_id',
          'CV': 'cv',
        };

        await Promise.allSettled(rows.map(r => safeDeleteDriveByFilePath(r.filePath)));

        const del = await prisma.internDocument.deleteMany({
          where: { id: { in: rows.map(r => r.id) } },
        });

        // Log deletion for each document
        const actor = (req as any).user as { id: number };
        for (const row of rows) {
          const kind = docTypeToKind[row.documentType] || row.documentType.toLowerCase();
          const fileId = extractDriveId(row.filePath || '') || null;
          await logDocumentAction({
            action: 'delete',
            documentType: kind,
            fileName: row.fileName || row.originalName || `document_${kind}`,
            fileId,
            internId,
            internName: internDetail?.name || null,
            userId: internDetail?.userId || null,
            performedBy: actor.id,
            expiryDate: row.expiryDate || null,
            req,
          });
        }

        return res.json({ ok: true, deleted: del.count });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'delete-all failed' });
      }
    }
  );

  // POST /api/admin/avatar/delete  { internId }
  router.post(
    '/avatar/delete',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const { internId } = (req.body || {}) as { internId?: string };
        if (!internId) return res.status(400).json({ error: 'internId required' });

        const rows = await prisma.internDocument.findMany({
          where: { internId, isActive: true, documentType: 'PROFILE_PICTURE' as any },
          select: { id: true, filePath: true },
        });

        await Promise.allSettled(rows.map(r => safeDeleteDriveByFilePath(r.filePath)));

        const del = await prisma.internDocument.deleteMany({
          where: { id: { in: rows.map(r => r.id) } },
        });

        return res.json({ ok: true, deleted: del.count });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'avatar delete failed' });
      }
    }
  );



  // DELETE /api/admin/users/intern/:internId
  // Hard delete an inactive intern and all dependent rows (Inactive tab)
  router.delete(
    '/users/intern/:internId',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req: Request, res: Response) => {
      try {
        const internId = String(req.params.internId || '').trim();
        if (!internId) return res.status(400).json({ error: 'internId required' });

        // collect Drive file IDs (docs + profile picture) BEFORE we delete DB rows
        const docRows = await prisma.internDocument.findMany({
          where: { internId },
          select: { filePath: true },
        });
          const fileIds = docRows
            .map(r => driveFileIdFromPath(r.filePath))
            .filter((v): v is string => !!v);

        await prisma.$transaction(async (tx) => {
          await tx.notification.deleteMany({ where: { internId } });
          await tx.documentVerification.deleteMany({ where: { internId } });
          await tx.internDocument.deleteMany({ where: { internId } });
          await tx.internsSosDetail.deleteMany({ where: { internId } });
          await tx.internshipInfo.deleteMany({ where: { internId } });

          // delete rent_email_log rows linked to this intern's allocations
  const allocs = await tx.allocation.findMany({
    where: { internId },
    select: { id: true },
  });
  if (allocs.length) {
    await tx.rentEmailLog.deleteMany({
      where: { allocationId: { in: allocs.map(a => a.id) } },
    });
  }

          await tx.allocation.deleteMany({ where: { internId } });
          await tx.internDetail.delete({ where: { internId } });
        });

      // best-effort Drive cleanup (don’t fail the request if some deletions fail)
          let driveDeleted = 0;
          if (fileIds.length) {
            const results = await Promise.allSettled(fileIds.map(id => deleteDriveFile(id)));
            driveDeleted = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
          }

          return res.json({
            ok: true,
            mode: 'intern_detail_deleted',
            internId,
            driveFilesTried: fileIds.length,
            driveFilesDeleted: driveDeleted,
          });
      } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'Delete failed' });
      }
    }
  );




  /** SMTP endpoints (unchanged) */
  router.get(
    '/smtp',
    ensureAuthenticated as any,
    ...authorize('super_admin'),
    async (_req: Request, res: Response) => {
      const row = await prisma.smtpSetting.findUnique({ where: { id: 1 } });
      if (!row) {
        return res.json({
          host: '', port: 587, encryption: 'STARTTLS', user: '', pass: '',
          hasPassword: false, fromName: '', fromEmail: '', source: 'unconfigured',
        });
      }
      res.json({
        host: row.host, port: row.port, encryption: row.encryption, user: row.user, pass: '',
        hasPassword: !!row.pass, fromName: row.fromName, fromEmail: row.fromEmail,
        updatedAt: row.updatedAt, updatedBy: row.updatedBy, source: 'db',
      });
    }
  );


  router.put('/smtp', ensureAuthenticated as any,
    ...authorize('super_admin'), async (req: Request, res: Response) => {
    const body = req.body as {
      host?: string; port?: number; encryption?: 'NONE'|'STARTTLS'|'TLS';
      user?: string; pass?: string; fromName?: string; fromEmail?: string;
    };
    if (!body.host || !body.port || !body.encryption || !body.user || !body.fromEmail) {
      return res.status(400).json({ error: 'host, port, encryption, user, fromEmail are required' });
    }
    if (!['NONE','STARTTLS','TLS'].includes(body.encryption)) {
      return res.status(400).json({ error: 'invalid encryption' });
    }
    const existing = await prisma.smtpSetting.findUnique({ where: { id: 1 } });
    const effectivePass = body.pass && body.pass.length > 0 ? body.pass : (existing?.pass ?? '');
    if (!effectivePass) return res.status(400).json({ error: 'password is required at least once' });

    const data = {
      host: body.host, port: Number(body.port), encryption: body.encryption,
      user: body.user, pass: effectivePass,
      fromName: body.fromName || '', fromEmail: body.fromEmail,
      updatedBy: (req as any)?.user?.id ?? null,
    };

    await prisma.smtpSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

    try {
      const nodemailer = (await import('nodemailer')).default;
      const transporter =
        body.encryption === 'TLS'
          ? nodemailer.createTransport({ host: data.host, port: data.port, secure: true,  auth: { user: data.user, pass: data.pass } })
          : body.encryption === 'STARTTLS'
            ? nodemailer.createTransport({ host: data.host, port: data.port, secure: false, requireTLS: true, auth: { user: data.user, pass: data.pass } })
            : nodemailer.createTransport({ host: data.host, port: data.port, secure: false, auth: { user: data.user, pass: data.pass } });
      await transporter.verify();
    } catch (e: any) {
      return res.status(400).json({ error: `SMTP verify failed: ${e?.message || e}` });
    }

    const { invalidateMailerCache } = await import('../lib/mailer');
    invalidateMailerCache();
    res.json({ ok: true });
  });

  // POST /api/admin/smtp/test
  router.post(
    '/smtp/test',
    ensureAuthenticated as any,
    ...authorize('super_admin'),
    async (req: Request, res: Response) => {
      const { to, subject, text } = req.body || {};
      if (!to) return res.status(400).json({ error: 'to is required' });

      const uid = (req as any)?.user?.id ?? 'anon';
      (global as any).__smtp_last__ = (global as any).__smtp_last__ || new Map();
      const last = (global as any).__smtp_last__.get(uid) as number | undefined;
      const now = Date.now();
      if (last && now - last < 10_000) return res.status(429).json({ error: 'Please wait before testing again' });
      (global as any).__smtp_last__.set(uid, now);

      try {
        const { transporter, from } = await getMailer();
        await transporter.verify();
        await transporter.sendMail({
          from, to,
          subject: subject || 'SMTP test',
          text: text || `SMTP test from HRMS at ${new Date().toISOString()}`,
          html: `<p>SMTP test from HRMS</p><p><b>Time:</b> ${new Date().toISOString()}</p>`,
        });
        return res.json({ ok: true });
      } catch (e: any) {
        return res.status(400).json({ error: `Test failed: ${e?.message || e}` });
      }
    }
  );



  // DELETE one specific document for an intern
  // DELETE /api/admin/interns/:internId/docs/:kind
  router.delete(
    '/interns/:internId/docs/:kind',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const internId = String(req.params.internId || '').trim();
        const kind = String(req.params.kind || '').toLowerCase();
        const enumType = KIND_TO_ENUM[kind];
        if (!internId || !enumType) return res.status(400).json({ error: 'invalid params' });

        const doc = await prisma.internDocument.findFirst({
          where: { internId, documentType: enumType, isActive: true },
          select: { id: true, filePath: true },
        });
        if (!doc) return res.json({ ok: true, deleted: 0, driveDeleted: false });

        await deleteOneInternDocument(doc);
        return res.json({ ok: true, deleted: 1, driveDeleted: true });
      } catch (e:any) {
        return res.status(500).json({ error: e?.message || 'delete_failed' });
      }
    }
  );

  // DELETE all four required docs for an intern
  // DELETE /api/admin/interns/:internId/docs-all
  router.delete(
    '/interns/:internId/docs-all',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const internId = String(req.params.internId || '').trim();
        if (!internId) return res.status(400).json({ error: 'internId required' });
        const out = await deleteAllRequiredDocsForIntern(internId);
        return res.json({ ok: true, ...out });
      } catch (e:any) {
        return res.status(500).json({ error: e?.message || 'bulk_delete_failed' });
      }
    }
  );

  // PREVIEW: upcoming document deletions by end-date + delay
  // GET /api/admin/doc-cleanup/upcoming?windowDays=7&delayAmount=0&delayUnit=days
  router.get(
    '/doc-cleanup/upcoming',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const windowDays = Math.max(1, Math.min(31, Number(req.query.windowDays ?? 7)));
        const delayAmount = Math.max(0, Number(req.query.delayAmount ?? 0));
        const delayUnit = (String(req.query.delayUnit || 'days') as 'days'|'weeks'|'months');
        const delay = toDays(delayAmount, delayUnit);

        // latest internship row per intern (with an endDate)
        const rows = await prisma.internshipInfo.findMany({
          where: { endDate: { not: null } },
          orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
          include: {
            intern: { select: { name: true, email: true } },
            department: { select: { departmentName: true } },
            position: { select: { name: true } },
          },
        });

        const seen = new Set<string>();
        const latest: typeof rows = [];
        for (const r of rows) if (!seen.has(r.internId)) { seen.add(r.internId); latest.push(r); }

        const now = new Date();
        const soon = addDays(now, windowDays);
        const out: any[] = [];

        // pre-load docs for these interns
        const internIds = latest.map(r => r.internId);
        const docs = internIds.length ? await prisma.internDocument.findMany({
          where: { internId: { in: internIds }, isActive: true, documentType: { in: DOC_REQUIRED } },
          select: { internId: true, documentType: true },
        }) : [];
        const docsMap = new Map<string, Set<string>>();
        for (const d of docs) {
          const s = docsMap.get(d.internId) || new Set<string>();
          s.add(d.documentType as string);
          docsMap.set(d.internId, s);
        }

        for (const r of latest) {
          const end = r.endDate!;
          const scheduled = addDays(end, delay);
          if (scheduled >= now && scheduled <= soon) {
            const hasAny = (docsMap.get(r.internId)?.size || 0) > 0;
            if (!hasAny) continue;
            out.push({
              internId: r.internId,
              name: r.intern?.name ?? '',
              department: r.department?.departmentName ?? null,
              position: r.position?.name ?? null,
              endDate: end,
              scheduledDelete: scheduled,
              hasAnyDocument: hasAny,
            });
          }
        }

        return res.json({ windowDays, delayDays: delay, items: out });
      } catch (e:any) {
        return res.status(500).json({ error: e?.message || 'failed' });
      }
    }
  );




  // GET /api/admin/doc-cleanup/policy
  // replace the whole route with this
  router.get(
    '/doc-cleanup/policy',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (_req, res) => {
      const row = await prisma.documentDeletionPolicy.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, enabled: false, delayAmount: 0, delayUnit: 'days', includeProfileImage: false } as any,
      });
      res.json({
        ...row,
        includeAvatar: !!(row as any).includeProfileImage,      // for the current UI
        includeProfileImage: !!(row as any).includeProfileImage // explicit too
      });
    }
  );



  // PUT /api/admin/doc-cleanup/policy
  // replace the whole route with this
  router.put(
    '/doc-cleanup/policy',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      const { enabled, delayAmount, delayUnit, includeAvatar, includeProfileImage } = req.body as {
        enabled?: boolean;
        delayAmount?: number;
        delayUnit?: 'days'|'weeks'|'months';
        includeAvatar?: boolean;        // from UI
        includeProfileImage?: boolean;  // optional explicit
      };

      if (delayUnit && !['days','weeks','months'].includes(delayUnit)) {
        return res.status(400).json({ error: 'invalid_delay_unit' });
      }

      const data: any = {};
      if (enabled !== undefined) data.enabled = !!enabled;
      if (Number.isFinite(delayAmount)) data.delayAmount = Number(delayAmount);
      if (delayUnit) data.delayUnit = delayUnit;
      if (typeof includeAvatar === 'boolean') data.includeProfileImage = includeAvatar;
      if (typeof includeProfileImage === 'boolean') data.includeProfileImage = includeProfileImage;

      await prisma.documentDeletionPolicy.update({ where: { id: 1 }, data });
      const row = await prisma.documentDeletionPolicy.findUnique({ where: { id: 1 } });

      res.json({
        ...row,
        includeAvatar: !!(row as any)?.includeProfileImage,
        includeProfileImage: !!(row as any)?.includeProfileImage,
      });
    }
  );




  // POST /api/admin/doc-cleanup/run-now
  // POST /api/admin/doc-cleanup/run-now
  router.post(
    '/doc-cleanup/run-now',
    ensureAuthenticated as any,
    ...authorize('hr','super_admin'),
    async (req, res) => {
      try {
        const { ignoreDelay, includeAvatar } = (req.body || {}) as {
          ignoreDelay?: boolean;
          includeAvatar?: boolean;
        };

        const out = await runDocumentDeletionCycle({
          ignoreDelay: !!ignoreDelay,
          includeAvatar: !!includeAvatar,
        });

        // out has: { ok, processedInterns, deletedDocs, driveDeleted, avatarDeleted, skippedNoDocs }
        return res.json(out);
      } catch (e:any) {
        return res.status(500).json({ error: e?.message || 'run_failed' });
      }
    }
  );

// ---------------------------------------------------------------------------
// Employee CSV import – preview
// POST /api/admin/import/preview
// Form-data: file=<csv file>
// Returns headers + first rows so UI can map columns to fields.
// ---------------------------------------------------------------------------
router.post(
  '/import/preview',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'FILE_REQUIRED' });
      }

      const mime = req.file.mimetype || '';
      // basic safety check; we still allow if browser sends generic type
      const allowed = [
        'text/csv',
        'application/vnd.ms-excel',
        'text/plain',
      ];
      if (!allowed.includes(mime) && !req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'INVALID_FILE_TYPE' });
      }

      const csvText = req.file.buffer.toString('utf8');

      // parse CSV safely into [row][col]
      let records: string[][];
      try {
        records = parse(csvText, {
          columns: false,          // we treat everything as data, row[0] is "header" row
          skip_empty_lines: true,
          trim: true,
        }) as string[][];
      } catch (e: any) {
        return res.status(400).json({ error: 'INVALID_CSV', detail: e?.message || String(e) });
      }

      if (!records.length) {
        return res.status(400).json({ error: 'EMPTY_FILE' });
      }

      const headerRow = records[0].map((v) => (v ?? '').toString());
      const dataRows  = records.slice(1);
      const previewRows = dataRows.slice(0, 20); // limit rows we send to the browser

      return res.json({
        fileName: req.file.originalname,
        rowCount: dataRows.length,
        columnCount: headerRow.length,
        header: headerRow,
        rows: previewRows,
        // tell the UI what fields are available and which are required
        fields: IMPORT_FIELDS,
      });
    } catch (e: any) {
      console.error('CSV preview error:', e);
      return res.status(500).json({ error: 'PREVIEW_FAILED', detail: e?.message || String(e) });
    }
  }
);

function parseDateOnly(s?: string | null): Date | null {
  const v = String(s ?? '').trim();
  if (!v) return null;

  // Expect YYYY-MM-DD
  const [yy, mm, dd] = v.split('-').map(Number);
  if (!yy || !mm || !dd) return null;

  // Store as UTC date-only
  return new Date(Date.UTC(yy, mm - 1, dd));
}




type SetupEmailResult = { userId: number; email: string; ok: boolean; error?: string };

const FRONTEND_BASE = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
const SETUP_LINK_TTL_MS = 30 * 60 * 1000; // 30 minutes (same as forgot-password)

const randToken = () => randomBytes(32).toString('hex');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] as string));

async function sendSetupLinkForUser(
  userId: number,
  email: string,
  name: string,
  req: Request
): Promise<SetupEmailResult> {
  try {
    const token = randToken();
    const tokenHash = sha256(token);

    // Replace any previous tokens (so “retry” is clean)
    await prisma.passwordResetToken.deleteMany({ where: { userId } });

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + SETUP_LINK_TTL_MS),
        ip: req.ip || undefined,
        userAgent: req.get('user-agent') || undefined,
      },
    });

    const link = `${FRONTEND_BASE}/change-password?token=${token}`;

    const safeName = escapeHtml(name || email);
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;line-height:1.5">
        <h2 style="margin:0 0 12px">Set your password</h2>
        <p style="margin:0 0 10px">Hello ${safeName},</p>
        <p style="margin:0 0 10px">An account has been created for you in the Employee Management System.</p>
        <p style="margin:0 0 10px">Click the link below to set your password (valid for 30 minutes):</p>
        <p style="margin:14px 0">
          <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#1e90ff;color:#fff;text-decoration:none">
            Set your password
          </a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:13px">If you didn’t expect this email, you can ignore it.</p>
      </div>
    `;

    await sendTemplateMail({
  key: 'setup_password',
  to: email,
  data: {
    recipientName: name,
    setupUrl: link,
    expiresMinutes: 30,
  },
});


    return { userId, email, ok: true };
  } catch (e: any) {
    return { userId, email, ok: false, error: e?.message || String(e) };
  }
}

async function sendSetupLinksForUsers(
  users: Array<{ userId: number; email: string; name: string }>,
  req: Request
): Promise<SetupEmailResult[]> {
  const results: SetupEmailResult[] = [];
  for (const u of users) {
    results.push(await sendSetupLinkForUser(u.userId, u.email, u.name, req));
  }
  return results;
}



// ---------------------------------------------------------------------------
// Employee CSV import – commit
// POST /api/admin/import/commit
// Form-data: file=<csv>, mapping=<JSON-string>
// mapping: { [fieldId: string]: number | null }  // column index for each field
// ---------------------------------------------------------------------------
router.post(
  '/import/commit',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'FILE_REQUIRED' });
      }

      const mappingRaw = typeof req.body?.mapping === 'string' ? req.body.mapping : '';
      if (!mappingRaw) {
        return res.status(400).json({ error: 'MAPPING_REQUIRED' });
      }

      let mapping: Record<string, number | null>;
try {
  mapping = JSON.parse(mappingRaw);
} catch {
  return res.status(400).json({ error: 'MAPPING_INVALID' });
}

// IMPORTANT: define it once here so the whole handler can use it
const companyEmailMode = req.body?.companyEmailMode === 'generate' ? 'generate' : 'csv';


// Check that all required fields have a mapped column
// - companyEmail is only required when mode = "existing"
const requiredFields = IMPORT_FIELDS.filter((f) =>
  f.required || (companyEmailMode === 'csv' && f.id === 'companyEmail')
);

const missingRequired = requiredFields.filter((f) => {
  const idx = mapping[f.id];
  return idx == null || Number.isNaN(Number(idx));
});

if (missingRequired.length) {
  return res.status(400).json({
    error: 'MISSING_REQUIRED_FIELDS',
    fields: missingRequired.map((f) => f.id),
  });
}


      const csvText = req.file.buffer.toString('utf8');
      let records: string[][];
      try {
        records = parse(csvText, {
          columns: false,
          skip_empty_lines: true,
          trim: true,
        }) as string[][];
      } catch (e: any) {
        return res.status(400).json({ error: 'INVALID_CSV', detail: e?.message || String(e) });
      }

      if (!records.length) {
        return res.status(400).json({ error: 'EMPTY_FILE' });
      }

      const dataRows = records.slice(1); // skip header

      // Helper to read a field from a row using mapping
      const getField = (row: string[], fieldId: string): string => {
        const idx = mapping[fieldId];
        if (idx == null) return '';
        const v = row[idx];
        return (v ?? '').toString().trim();
      };

      // Date parser that supports:
      // - YYYY-MM-DD
      // - DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
      const parseDate = (s: string): Date | null => {
        const trimmed = s.trim();
        if (!trimmed) return null;

        const parts = trimmed.split(/[./-]/);
        if (parts.length === 3) {
          let [a, b, c] = parts;

          if (a.length === 4) {
            // YYYY-MM-DD
            const year = Number(a);
            const month = Number(b);
            const day = Number(c);
            if (!year || !month || !day) return null;
            return new Date(Date.UTC(year, month - 1, day));
          } else {
            // DD-MM-YYYY or DD/MM/YYYY etc.
            const day = Number(a);
            const month = Number(b);
            const year = Number(c);
            if (!year || !month || !day) return null;
            return new Date(Date.UTC(year, month - 1, day));
          }
        }

        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? null : d;
      };

      const stats = {
        total: dataRows.length,
        createdUsers: 0,
        createdInterns: 0,
        createdInternships: 0,
        skippedExisting: 0,
        skippedEmpty: 0,
        rowErrors: [] as { row: number; error: string }[],
      };

      const createdForSetup: Array<{ userId: number; email: string; name: string }> = [];


      // Capture creation tracking info
      const createdByUserId = (req as any)?.user?.id ?? null;
      const creatorUser = createdByUserId 
        ? await prisma.user.findUnique({
            where: { id: createdByUserId },
            select: { role: true, empType: true }
          })
        : null;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || (req.headers['x-real-ip'] as string) 
        || req.socket?.remoteAddress 
        || null;
      const userAgent = req.headers['user-agent'] || null;

      await prisma.$transaction(async (tx) => {
        // Cache for Department / Position names
        const deptCache = new Map<string, number>(); // key: lowercased name
        const posCache = new Map<string, { id: number; departmentId: number }>();



        async function getDepartmentId(nameRaw: string): Promise<number> {
          const name = nameRaw.trim();
          const key = name.toLowerCase();
          if (deptCache.has(key)) return deptCache.get(key)!;

          const existing = await tx.department.findFirst({
            where: { departmentName: name },
            select: { id: true },
          });
          if (existing) {
            deptCache.set(key, existing.id);
            return existing.id;
          }

          const created = await tx.department.create({
            data: { departmentName: name },
            select: { id: true },
          });
          deptCache.set(key, created.id);
          return created.id;
        }

        async function getPositionId(nameRaw: string, departmentId: number): Promise<number> {
          const name = nameRaw.trim();
          const key = `${departmentId}::${name.toLowerCase()}`;
          if (posCache.has(key)) return posCache.get(key)!.id;

          const existing = await tx.position.findFirst({
            where: { name, departmentId },
            select: { id: true },
          });
          if (existing) {
            posCache.set(key, { id: existing.id, departmentId });
            return existing.id;
          }

          const created = await tx.position.create({
            data: { name, departmentId },
            select: { id: true },
          });
          posCache.set(key, { id: created.id, departmentId });
          return created.id;
        }

        // Seed for empId generation (E00001, E00002, ...)
        const lastUser = await tx.user.findFirst({
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        let empCounter = (lastUser?.id ?? 0) + 1;

        // Domain to use for generated company emails
const sys = await tx.systemConfig.findUnique({ where: { id: 1 }, select: { companyEmailDomain: true, googleWorkspaceDomain: true } });
const emailDomain =
  (sys?.companyEmailDomain || sys?.googleWorkspaceDomain || process.env.GSUITE_DOMAIN || 'extramus.eu')
    .trim()
    .toLowerCase();

const normalizeLocal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');

const usedGenerated = new Set<string>();

async function generateUniqueCompanyEmail(firstName: string, surname: string, personalEmail: string) {
  const fallback = (personalEmail.split('@')[0] || '').trim();
  const base = normalizeLocal(`${firstName}.${surname}`) || normalizeLocal(fallback) || 'user';

  for (let n = 0; n < 500; n++) {
    const local = n === 0 ? base : `${base}${n + 1}`;
    const candidate = `${local}@${emailDomain}`;

    if (usedGenerated.has(candidate)) continue;

    const exists = await tx.user.findFirst({
      where: { companyEmail: { equals: candidate, mode: 'insensitive' } },
      select: { id: true },
    });

    if (!exists) {
      usedGenerated.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not generate unique company email for ${firstName} ${surname}`);
}


        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const rowNumber = i + 2; // +1 for header, +1 for 1-based line number

          const firstName    = getField(row, 'firstName');
          const surname      = getField(row, 'surname');

          const personalEmailRaw = getField(row, 'personalEmail');
          const personalEmail = personalEmailRaw.trim().toLowerCase();
          const companyEmailFromCsv = (getField(row, 'companyEmail') || '').trim().toLowerCase();

          const department   = getField(row, 'department');
          const position     = getField(row, 'position');
          const startDateStr = getField(row, 'startDate');
          const endDateStr   = getField(row, 'endDate');
          const empTypeRaw   = getField(row, 'empType');

          const nationality  = getField(row, 'nationality') || null;
          const gender       = getField(row, 'gender') || null;
          const phone        = getField(row, 'phone') || null;
          const birthdateStr = getField(row, 'birthdate');
          const supervisor   = getField(row, 'supervisor') || null;


          const startDate = parseDateOnly(startDateStr);
if (!startDate) {
  stats.rowErrors.push({ row: rowNumber, error: 'Invalid start date' });
  continue;
}

const endDate = endDateStr ? parseDateOnly(endDateStr) : null;
if (endDateStr && !endDate) {
  stats.rowErrors.push({ row: rowNumber, error: 'Invalid end date' });
  continue;
}

const birthdate = birthdateStr ? parseDateOnly(birthdateStr) : null;
if (birthdateStr && !birthdate) {
  stats.rowErrors.push({ row: rowNumber, error: 'Invalid birthdate' });
  continue;
}

          // Skip completely empty lines
          if (!firstName && !surname && !personalEmail && !companyEmailFromCsv) {
  stats.skippedEmpty++;
  continue;
}


          // Per-row required validation
          if (
  !firstName ||
  !surname ||
  !personalEmail ||
  !department ||
  !position ||
  !startDateStr ||
  !empTypeRaw ||
  (companyEmailMode === 'csv' && !companyEmailFromCsv)

) {
  stats.rowErrors.push({ row: rowNumber, error: 'Missing required field(s)' });
  continue;
}

// If personal email already exists in InternDetail => treat as existing
const existingByPersonal = await tx.internDetail.findFirst({
  where: { email: { equals: personalEmail, mode: 'insensitive' } },
  select: { internId: true },
});
if (existingByPersonal) {
  stats.skippedExisting++;
  continue;
}

// Resolve company email based on mode
const companyEmail =
  companyEmailMode === 'generate'
    ? await generateUniqueCompanyEmail(firstName, surname, personalEmail)
    : companyEmailFromCsv;


// If company email already exists in User => treat as existing
const existingUser = await tx.user.findFirst({
  where: { companyEmail: { equals: companyEmail, mode: 'insensitive' } },
  select: { id: true },
});
if (existingUser) {
  stats.skippedExisting++;
  continue;
}

          // Map Employee Type string → EmpType enum
          const empTypeNorm = empTypeRaw.trim().toLowerCase();
          let empType: $Enums.EmpType;
          if (empTypeNorm === 'intern') empType = 'intern';
          else if (empTypeNorm === 'employee') empType = 'employee';
          else if (['team_lead', 'team lead', 'teamlead'].includes(empTypeNorm)) empType = 'team_lead';
          else {
            stats.rowErrors.push({ row: rowNumber, error: `Unknown Employee Type: "${empTypeRaw}"` });
            continue;
          }

          const empId = `E${String(empCounter).padStart(5, '0')}`;
          empCounter += 1;

          // Random initial password (users will reset via "Forgot password")
          const plainPassword = `Init-${Math.random().toString(36).slice(2, 10)}`;
          const passwordHash = await bcrypt.hash(plainPassword, 10);

          // Create portal user (all as role "intern" by default; HR/super_admin set manually)
          const newUser = await tx.user.create({
            data: {
              firstName,
              surname,
              companyEmail,
              password: passwordHash,
              role: 'intern', // portal role; empType is business-type
              empType,
              empId,
              mustChangePassword: true,
              blocked: false,
              createdBy: createdByUserId,
              createdByRole: creatorUser?.role || null,
              createdByEmpType: creatorUser?.empType || null,
              creationIp: ip?.substring(0, 45) || null,
              creationUserAgent: userAgent?.substring(0, 255) || null,
              creationMethod: 'csv_import',
            },
            select: { id: true },
          });
          stats.createdUsers++;

          createdForSetup.push({
  userId: newUser.id,
  email: companyEmail,
  name: `${firstName} ${surname}`.trim(),
});


          // InternDetail
          const intern = await tx.internDetail.create({
            data: {
              userId: newUser.id,
              name: `${firstName} ${surname}`.trim(),
              nationality,
              gender,
              phone,
              email: personalEmail,
              birthdate,
            },
            select: { internId: true },
          });
          stats.createdInterns++;

          const departmentId = await getDepartmentId(department);
          const positionId   = await getPositionId(position, departmentId);

          await tx.internshipInfo.create({
            data: {
              internId: intern.internId,
              departmentId,
              positionId,
              startDate,
              endDate,
              supervisor,
              status: 'Active',
            },
          });
          stats.createdInternships++;
        }
      });

      const setupEmails = await sendSetupLinksForUsers(createdForSetup, req);
const setupEmailsSent = setupEmails.filter(r => r.ok).length;
const setupEmailsFailed = setupEmails.length - setupEmailsSent;

return res.json({
  ...stats,
  setupEmailsSent,
  setupEmailsFailed,
  setupEmails,
});

    } catch (e: any) {
      console.error('CSV commit error:', e);
      return res.status(500).json({ error: 'COMMIT_FAILED', detail: e?.message || String(e) });
    }
  }
);


router.post(
  '/import/resend-setup-links',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const userIdsRaw = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const userIds = userIdsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));

      if (!userIds.length) return res.status(400).json({ error: 'USER_IDS_REQUIRED' });

      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, companyEmail: true, firstName: true, surname: true },
      });

      const payload = users.map(u => ({
        userId: u.id,
        email: u.companyEmail,
        name: `${u.firstName} ${u.surname}`.trim(),
      }));

      const results = await sendSetupLinksForUsers(payload, req);
      return res.json({ ok: true, count: results.length, results });
    } catch (e: any) {
      console.error('resend-setup-links error:', e);
      return res.status(500).json({ error: 'RESEND_FAILED', detail: e?.message || String(e) });
    }
  }
);



  export default router;
