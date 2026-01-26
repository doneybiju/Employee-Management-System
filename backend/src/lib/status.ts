// backend/src/lib/status.ts
import prisma from '../prisma';


export async function loadEmployeeDashboardByUserId(userId: number) {
  const detail = await prisma.employeeDetail.findFirst({ where: { userId } });
  if (!detail) return { hasEmployee: false } as const;

  const employment = await prisma.employeeInfo.findFirst({
    where: { employeeId: detail.employeeId },
    orderBy: { startDate: 'desc' },
    include: { department: true, position: true },
  });

  const payments: Array<{
    date: string;
    description: string;
    amount: number;
    status: 'Paid' | 'Pending';
  }> = [];

  const end = employment?.endDate ?? null;
  const daysRemaining = end
    ? Math.max(0, Math.ceil((+end - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    hasEmployee: true,
    employeeId: detail.employeeId,
    status: employment?.status ?? null,
    startDate: employment?.startDate ?? null,
    endDate: end,
    department: employment?.department?.departmentName ?? null,
    position: employment?.position?.name ?? null,
    supervisor: employment?.supervisor ?? null,
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
  // Also fetch recent intern registrations for timeline
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(1); // Set to 1st to avoid rollover on 31st (e.g. Jul 31 -> Feb 28/29 -> Mar 3/2)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [activeInterns, activeEmployees, activeTeamLeads, recentInterns] = await Promise.all([
    prisma.user.count({ where: { blocked: false, empType: 'intern' } }),
    prisma.user.count({ where: { blocked: false, empType: 'employee' } }),
    prisma.user.count({ where: { blocked: false, empType: 'team_lead' } }),
    prisma.user.findMany({
      where: {
        empType: 'intern',
        blocked: false,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
    }),
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
      employeeDetails: {
        select: {
          employeeDocuments: {
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

    for (const det of u.employeeDetails ?? []) {
      for (const doc of det.employeeDocuments ?? []) {
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

  // Build timeline (last 6 months)
  const timelineMap = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMonthsAgo);
    d.setMonth(d.getMonth() + i);
    const key = d.toISOString().slice(0, 7); // YYYY-MM
    timelineMap.set(key, 0);
  }

  for (const u of recentInterns) {
    const key = u.createdAt.toISOString().slice(0, 7);
    if (timelineMap.has(key)) {
      timelineMap.set(key, (timelineMap.get(key) || 0) + 1);
    }
  }

  const timeline = Array.from(timelineMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    activeInterns,
    activeEmployees,
    activeTeamLeads,
    missingDocs: { count: missingCount, total, percent },
    timeline,
  };
}



export async function loadAdminPeopleCounts() {
  // Active interns = latest employment row per employee with status 'Active'
  const rows = await prisma.employeeInfo.findMany({
    orderBy: [{ employeeId: 'asc' }, { startDate: 'desc' }],
    select: { employeeId: true, status: true },
  });
  const seen = new Set<string>();
  let activeInterns = 0;
  for (const r of rows) {
    if (seen.has(r.employeeId)) continue;
    seen.add(r.employeeId);
    if (String(r.status) === 'Active') activeInterns++;
  }

  // Employees / Owners = counts by users.empType
  const [employees, owners] = await Promise.all([
    prisma.user.count({ where: { empType: 'employee' as any } }),
    prisma.user.count({ where: { empType: 'owner'    as any } }),
  ]);

  return { interns: activeInterns, employees, owners };
}

export async function refreshEmployeeStatuses() {
  // Using midday to avoid timezone boundary issues when comparing against @db.Date columns.
const today = new Date();
today.setHours(12, 0, 0, 0);

  // 1) find userIds whitelisted for deprovision
  const wl = await prisma.reminderWhitelist.findMany({
    where: { skipDeprov: true },
    select: { userId: true },
  });
  const wlUserIds = new Set(wl.map(w => w.userId));

  // 2) map to employeeIds (employee_details.user_id -> employee_details.employee_id)
  const wlEmployeesRows = wlUserIds.size
    ? await prisma.employeeDetail.findMany({
        where: { userId: { in: Array.from(wlUserIds) } },
        select: { employeeId: true },
      })
    : [];
  const wlEmployeeIds = wlEmployeesRows.map(r => r.employeeId);

  // 3) update statuses, but NEVER touch whitelisted employeeIds
  const [act, inact] = await prisma.$transaction([
    prisma.employeeInfo.updateMany({
  where: {
    employeeId: { notIn: wlEmployeeIds },
    employee: { is: { userId: { not: null } } }, // <- don’t re-activate deprovisioned accounts
    startDate: { lte: today },
    OR: [
      { endDate: null },
      { endDate: { gte: today } },
    ],
  },
  data: { status: 'Active' },
}),

    prisma.employeeInfo.updateMany({
      where: {
        employeeId: { notIn: wlEmployeeIds },
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
