// backend/src/lib/status.ts
import prisma from '../prisma';


export async function loadInternDashboardByUserId(userId: number) {
  const detail = await prisma.internDetail.findFirst({ where: { userId } });
  if (!detail) return { hasIntern: false } as const;

  const internship = await prisma.internshipInfo.findFirst({
    where: { internId: detail.internId },
    orderBy: { startDate: 'desc' },
    include: { department: true, position: true },
  });

  const payments: Array<{
    date: string;
    description: string;
    amount: number;
    status: 'Paid' | 'Pending';
  }> = [];

  const end = internship?.endDate ?? null;
  const daysRemaining = end
    ? Math.max(0, Math.ceil((+end - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    hasIntern: true,
    internId: detail.internId,
    status: internship?.status ?? null,
    startDate: internship?.startDate ?? null,
    endDate: end,
    department: internship?.department?.departmentName ?? null,
    position: internship?.position?.name ?? null,
    supervisor: internship?.supervisor ?? null,
    daysRemaining,
    payments,
  };
}


export async function loadAdminSummary() {
  const REQUIRED_DOCS = [
    'ACCEPTANCE_LETTER',
    'LEARNING_AGREEMENT',
    'ID_PASSPORT',
    'CV',
  ] as const;

  type ReqDoc = typeof REQUIRED_DOCS[number];

  // 1) People counts MUST come from users.empType (this matches what you see in the Users table)
  const [activeInterns, activeEmployees, activeTeamLeads] = await Promise.all([
    prisma.user.count({ where: { blocked: false, empType: 'intern' } }),
    prisma.user.count({ where: { blocked: false, empType: 'employee' } }),
    prisma.user.count({ where: { blocked: false, empType: 'team_lead' } }),
  ]);

  // 2) Document completion for intern users (optionally honor skipDocs whitelist)
  const wl = await prisma.reminderWhitelist.findMany({
    where: { skipDocs: true },
    select: { userId: true },
  });
  const skipUserIds = wl.map(w => w.userId);

  const internUsers = await prisma.user.findMany({
    where: {
      blocked: false,
      empType: 'intern',
      ...(skipUserIds.length ? { id: { notIn: skipUserIds } } : {}),
    },
    select: {
      id: true,
      internDetails: {
        select: {
          internDocuments: {
            where: { isActive: true, status: { not: 'rejected' } },
            select: { documentType: true },
          },
        },
      },
    },
  });

  let missingCount = 0;

  for (const u of internUsers) {
    const present = new Set<ReqDoc>();

    for (const det of u.internDetails ?? []) {
      for (const doc of det.internDocuments ?? []) {
        // doc.documentType is like 'CV', 'ID_PASSPORT', etc.
        const dt = doc.documentType as ReqDoc;
        if (REQUIRED_DOCS.includes(dt)) present.add(dt);
      }
    }

    const isMissingAny = REQUIRED_DOCS.some(t => !present.has(t));
    if (isMissingAny) missingCount += 1;
  }

  const total = internUsers.length;
  const percent = total > 0 ? Math.round((missingCount / total) * 100) : 0;

  return {
    activeInterns,
    activeEmployees,
    activeTeamLeads,
    missingDocs: { count: missingCount, total, percent },
    timeline: [] as Array<{ date: string; count: number }>, // keep as placeholder for now
  };
}



export async function loadAdminPeopleCounts() {
  // Active interns = latest internship row per intern with status 'Active'
  const rows = await prisma.internshipInfo.findMany({
    orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
    select: { internId: true, status: true },
  });
  const seen = new Set<string>();
  let activeInterns = 0;
  for (const r of rows) {
    if (seen.has(r.internId)) continue;
    seen.add(r.internId);
    if (String(r.status) === 'Active') activeInterns++;
  }

  // Employees / Owners = counts by users.empType
  const [employees, owners] = await Promise.all([
    prisma.user.count({ where: { empType: 'employee' as any } }),
    prisma.user.count({ where: { empType: 'owner'    as any } }),
  ]);

  return { interns: activeInterns, employees, owners };
}

export async function refreshInternStatuses() {
  // Using midday to avoid timezone boundary issues when comparing against @db.Date columns.
const today = new Date();
today.setHours(12, 0, 0, 0);

  // 1) find userIds whitelisted for deprovision
  const wl = await prisma.reminderWhitelist.findMany({
    where: { skipDeprov: true },
    select: { userId: true },
  });
  const wlUserIds = new Set(wl.map(w => w.userId));

  // 2) map to internIds (intern_details.user_id -> intern_details.intern_id)
  const wlInternsRows = wlUserIds.size
    ? await prisma.internDetail.findMany({
        where: { userId: { in: Array.from(wlUserIds) } },
        select: { internId: true },
      })
    : [];
  const wlInternIds = wlInternsRows.map(r => r.internId);

  // 3) update statuses, but NEVER touch whitelisted internIds
  const [act, inact] = await prisma.$transaction([
    prisma.internshipInfo.updateMany({
  where: {
    internId: { notIn: wlInternIds },
    intern: { is: { userId: { not: null } } }, // <- don’t re-activate deprovisioned accounts
    startDate: { lte: today },
    OR: [
      { endDate: null },
      { endDate: { gte: today } },
    ],
  },
  data: { status: 'Active' },
}),

    prisma.internshipInfo.updateMany({
      where: {
        internId: { notIn: wlInternIds },
        OR: [
          { endDate:   { lt: today } },
          { startDate: { gt: today } },
        ],
      },
      data: { status: 'Inactive' },
    }),
  ]);

  return { setActive: act.count, setInactive: inact.count, ranAt: new Date().toISOString() };
}
