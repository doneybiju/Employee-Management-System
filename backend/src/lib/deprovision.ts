// backend/src/lib/deprovision.ts
import cron, { ScheduledTask } from 'node-cron';
import prisma from '../prisma';
import { $Enums } from '@prisma/client';
import { googleDeleteUser } from '../google/deletion';

import { deleteDriveFileByAny } from '../google/deletion';
import { DocumentType, DelayUnit } from '@prisma/client';



type PolicyRow = {
  id: number;
  enabled: boolean;
  delayAmount: number;
  delayUnit: DelayUnit;
  transferTargetEmail: string | null;
  lastRunAt: Date | null;
  lastDeleted: number | null;
};



// Required docs we delete by default (avatar is optional)
const REQUIRED_DOC_TYPES: DocumentType[] = [
  'ACCEPTANCE_LETTER',
  'LEARNING_AGREEMENT',
  'ID_PASSPORT',
  'CV',
];

// Delete intern’s profile picture (from InternDocument: PROFILE_PICTURE)
async function deleteInternProfilePicture(internId: string) {
  const pics = await prisma.internDocument.findMany({
    where: { internId, isActive: true, documentType: 'PROFILE_PICTURE' as DocumentType },
    select: { id: true, filePath: true },
  });
  let driveDeleted = 0;
  await Promise.all(pics.map(async p => {
    try { await deleteDriveFileByAny(p.filePath || ''); driveDeleted += 1; } catch {}
  }));
  if (pics.length) await prisma.internDocument.deleteMany({ where: { id: { in: pics.map(p => p.id) } } });
  return driveDeleted;
}

// Best-effort: delete a user’s avatar if you store a user-level image
async function deleteUserAvatarByUserId(userId: number) {
  const u = await prisma.user.findUnique({ where: { id: userId } }) as any;
  if (!u) return false;

  const token = [
    u.avatarFileId, u.avatarPath,
    u.profileImageId, u.profileImagePath,
    u.profilePhotoId, u.profilePhotoPath,
  ].find((v: any) => typeof v === 'string' && v.trim());

  if (!token) return false;

  try { await deleteDriveFileByAny(token); } catch {}
  const data: any = {};
  ['avatarFileId','avatarPath','profileImageId','profileImagePath','profilePhotoId','profilePhotoPath']
    .forEach(k => { if (k in u) data[k] = null; });
  try { if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data }); } catch {}
  return true;
}


// ---------- time helpers ----------
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }

function delayToDays(amount: number, unit: DelayUnit): number {
  const n = Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (unit === 'weeks')  return n * 7;
  if (unit === 'months') return n * 30; // coarse
  return n;
}

// ---------- policy ----------
export async function getPolicyDb(): Promise<PolicyRow> {
  const row = await prisma.deprovisionPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      enabled: false,
      delayAmount: 0,
      delayUnit: 'days',
      transferTargetEmail: null,
      lastRunAt: null,
      lastDeleted: 0,
    },
  });
  return row as unknown as PolicyRow;
}

export async function updatePolicyDb(patch: Partial<Pick<PolicyRow, 'enabled' | 'delayAmount' | 'delayUnit' | 'transferTargetEmail'>>) {
  await prisma.deprovisionPolicy.update({
    where: { id: 1 },
    data: {
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.delayAmount === undefined ? {} : { delayAmount: patch.delayAmount }),
      ...(patch.delayUnit === undefined ? {} : { delayUnit: patch.delayUnit as any }),
      ...(patch.transferTargetEmail === undefined ? {} : { transferTargetEmail: patch.transferTargetEmail }),
    },
  });
}


// ---------- whitelist helpers (NEW) ----------
type DeprovWhitelistSets = { byId: Set<number>; byEmail: Set<string> };

async function getDeprovWhitelist(): Promise<DeprovWhitelistSets> {
  // If your model/table name differs, adjust `deprovisionWhitelist` and selected fields.
  const rows = await prisma.reminderWhitelist.findMany({
  where: { skipDeprov: true },
  select: { userId: true, user: { select: { companyEmail: true } } },
});

  const byId = new Set<number>();
  const byEmail = new Set<string>();
  for (const r of rows) {
    if (typeof r.userId === 'number') byId.add(r.userId);
    const em = r.user?.companyEmail?.toLowerCase().trim();
    if (em) byEmail.add(em);
  }
  return { byId, byEmail };
}

function isWhitelisted(userId?: number | null, email?: string | null, wl?: DeprovWhitelistSets) {
  if (!wl) return false;
  if (userId != null && wl.byId.has(userId)) return true;
  if (email) {
    const em = email.toLowerCase().trim();
    if (wl.byEmail.has(em)) return true;
  }
  return false;
}



export type DocDeleteParams =
  { internId: string; types?: DocumentType[] | 'all' };

export async function deleteDocsForIntern({ internId, types = REQUIRED_DOC_TYPES }: DocDeleteParams) {
  const where = { internId, ...(types === 'all' ? {} : { documentType: { in: types } }) };
  const docs = await prisma.internDocument.findMany({ where, select: { id: true, filePath: true } });

  await Promise.all(docs.map(d => deleteDriveFileByAny(d.filePath).catch(() => {})));

  // remove records after deletion
  const delRes = await prisma.internDocument.deleteMany({ where });
  return { deletedDb: delRes.count, attempted: docs.length };
}




function addUnit(d: Date, amount: number, unit: DelayUnit) {
  const x = new Date(d);
  if (unit === 'days') x.setDate(x.getDate() + amount);
  if (unit === 'weeks') x.setDate(x.getDate() + amount * 7);
  if (unit === 'months') x.setMonth(x.getMonth() + amount);
  return x;
}

/**
 * Deletes docs for interns where (endDate + delay) <= now.
 * Options:
 *  - ignoreDelay: if true, use endDate directly (skip policy delay)
 *  - includeAvatar: if true, also delete PROFILE_PICTURE + best-effort user avatar
 * Honors doc whitelist (reminderWhitelist.skipDocs).
 */
export async function runDocumentDeletionCycle(opts: { ignoreDelay?: boolean; includeAvatar?: boolean } = {}) {
  const policy = await prisma.documentDeletionPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabled: false, delayAmount: 0, delayUnit: 'days' }
  });

  if (!policy.enabled) return { skipped: true };

  const now = new Date();

  // ------- whitelist (skipDocs) -> internIds to skip -------
  const wl = await prisma.reminderWhitelist.findMany({
  where: { OR: [{ skipDocs: true }, { skipDeprov: true }] }, // honor deprov whitelist too
  select: { userId: true },
});

  const blockedUserIds = new Set(wl.map(w => w.userId));

  const details = await prisma.internDetail.findMany({
    select: { internId: true, userId: true },
  });
  const blockedInterns = new Set(
    details.filter(d => d.userId && blockedUserIds.has(d.userId)).map(d => d.internId)
  );

  // ------- latest internship row per intern with endDate -------
  const rows = await prisma.internshipInfo.findMany({
    where: { endDate: { not: null } },
    orderBy: [{ internId: 'asc' }, { startDate: 'desc' }],
    select: { internId: true, endDate: true, intern: { select: { userId: true } } },
  });

  const seen = new Set<string>();
  const latest: Array<{ internId: string; endDate: Date; userId: number | null }> = [];
  for (const r of rows) {
    if (!seen.has(r.internId)) {
      seen.add(r.internId);
      latest.push({ internId: r.internId, endDate: r.endDate!, userId: r.intern?.userId ?? null });
    }
  }

  // ------- decide cutoff per row -------
  function addUnit(d: Date, amount: number, unit: DelayUnit) {
    const x = new Date(d);
    if (unit === 'days') x.setDate(x.getDate() + amount);
    if (unit === 'weeks') x.setDate(x.getDate() + amount * 7);
    if (unit === 'months') x.setMonth(x.getMonth() + amount);
    return x;
  }

  const eligible = latest.filter(r => {
    if (blockedInterns.has(r.internId)) return false;
    const when = opts.ignoreDelay ? r.endDate : addUnit(r.endDate, policy.delayAmount, policy.delayUnit);
    return when <= now;
  });

  if (!eligible.length) {
    await prisma.documentDeletionPolicy.update({
      where: { id: 1 }, data: { lastRunAt: new Date(), lastDeleted: 0 }
    });
    return { deletedDocs: 0, driveDeleted: 0, processedInterns: 0, skippedNoDocs: eligible.length };
  }

  // ------- preload active docs (required only) -------
  const docs = await prisma.internDocument.findMany({
    where: {
      internId: { in: eligible.map(e => e.internId) },
      isActive: true,
      documentType: { in: REQUIRED_DOC_TYPES as any },
    },
    select: { id: true, filePath: true, internId: true },
  });

  const byIntern = new Map<string, { id: number; filePath: string | null }[]>();
  for (const d of docs) {
    const arr = byIntern.get(d.internId) || [];
    arr.push({ id: d.id, filePath: d.filePath });
    byIntern.set(d.internId, arr);
  }

  let deletedDocs = 0, driveDeleted = 0, processedInterns = 0, skippedNoDocs = 0, avatarDeleted = 0;

  for (const e of eligible) {
    processedInterns += 1;
    const list = byIntern.get(e.internId) || [];
    if (!list.length) { skippedNoDocs += 1; }

    await Promise.all(list.map(async doc => {
      try { await deleteDriveFileByAny(doc.filePath || ''); driveDeleted += 1; } catch {}
      await prisma.internDocument.delete({ where: { id: doc.id } });
      deletedDocs += 1;
    }));

    // optional: also remove profile picture & user avatar
    if (opts.includeAvatar) {
      try { avatarDeleted += await deleteInternProfilePicture(e.internId); } catch {}
      if (e.userId) { try { await deleteUserAvatarByUserId(e.userId); } catch {} }
    }
  }

  await prisma.documentDeletionPolicy.update({
    where: { id: 1 },
    data: { lastRunAt: new Date(), lastDeleted: deletedDocs }
  });

  return {
    ok: true,
    processedInterns,
    deletedDocs,
    driveDeleted,
    avatarDeleted,
    skippedNoDocs,
  };
}




/** Preview upcoming within a window (days) */
export async function upcomingDocDeletions(windowDays: number, delayAmount: number, delayUnit: DelayUnit) {
  const start = new Date();
  const end = new Date(); end.setDate(end.getDate() + windowDays);

  const list = await prisma.internshipInfo.findMany({
    where: { endDate: { not: null } },
    select: {
      internId: true, endDate: true,
      intern: {
        select: {
          name: true, nationality: true, phone: true, email: true,
          user: { select: { firstName: true, surname: true, companyEmail: true } }
        }
      }
    }
  });

  const items = list.map(l => {
    const scheduled = addUnit(l.endDate!, delayAmount, delayUnit);
    return {
      internId: l.internId,
      firstName: l.intern?.user?.firstName ?? null,
      surname:   l.intern?.user?.surname ?? null,
      department: null,
      endDate: l.endDate!.toISOString(),
      scheduledDelete: scheduled.toISOString(),
      email: l.intern?.user?.companyEmail ?? l.intern?.email ?? null,
    };
  }).filter(x => {
    const d = new Date(x.scheduledDelete);
    return d >= start && d <= end;
  });

  return { windowDays, delayDays: 0, items };
}

// ---------- core due selection ----------
function cutoffFromPolicy(pol: PolicyRow) {
  const delayDays = delayToDays(pol.delayAmount, pol.delayUnit);
  const today = startOfDay(new Date());
  return endOfDay(addDays(today, -delayDays));
}

/** List interns due for deprovision with their user + email */
/** List interns due for deprovision with their user + email (whitelist-aware) */
/** List interns due for deprovision with their user + email (whitelist-aware) */
async function listDueCandidates() {
  const pol = await getPolicyDb();
  const cutoff = cutoffFromPolicy(pol);

  // pull whitelist (skipDeprov)
  const blocked = new Set(
    (await prisma.reminderWhitelist.findMany({
      where: { skipDeprov: true },
      select: { userId: true },
    })).map(w => w.userId)
  );

  // Pick internships ended on/before cutoff; pull intern->user->companyEmail
  const rows = await prisma.internshipInfo.findMany({
    where: { endDate: { lte: cutoff } },
    orderBy: { endDate: 'asc' },
    select: {
      internId: true,
      endDate: true,
      intern: {
        select: {
          userId: true,
          user: { select: { id: true, companyEmail: true, role: true } },
        },
      },
    },
  });

  // Only those that still have a portal user (role intern) get deprovisioned
  return rows
    .filter(r => r.intern?.user?.id && !!(r.intern.user.companyEmail || '').trim())
    .filter(r => !blocked.has(r.intern!.user!.id)) // ← exclude whitelist
    .map(r => ({
      internId: r.internId,
      userId: r.intern!.user!.id,
      companyEmail: (r.intern!.user!.companyEmail || '').trim(),
      endDate: r.endDate || null,
    }));
}




/** Upcoming preview for page (whitelist-aware) */
export async function getUpcoming(windowDays = 7) {
  const pol = await getPolicyDb();
  const delayDays = delayToDays(pol.delayAmount, pol.delayUnit);

  const from = startOfDay(new Date());
  const to   = endOfDay(addDays(from, windowDays));

  // whitelist (skipDeprov)
  const blocked = new Set(
    (await prisma.reminderWhitelist.findMany({
      where: { skipDeprov: true },
      select: { userId: true },
    })).map(w => w.userId)
  );

  // Pull all candidates with endDate; compute scheduledDelete = endDate + delay
  const list = await prisma.internshipInfo.findMany({
    where: { endDate: { not: null } },
    orderBy: { endDate: 'asc' },
    include: {
      department: { select: { departmentName: true } },
      intern: {
        select: {
          name: true,
          user: { select: { id: true, companyEmail: true } },
        },
      },
    },
  });

  const projected = list
    .map(x => {
      const end = x.endDate!;
      const scheduled = addDays(end, delayDays);
      return {
        internId: x.internId,
        name: x.intern?.name ?? null,
        department: x.department?.departmentName ?? null,
        endDate: end.toISOString(),
        scheduledDelete: scheduled.toISOString(),
        email: x.intern?.user?.companyEmail ?? null,
        userId: x.intern?.user?.id ?? null,
      };
    })
    .filter(i => i.email && i.userId != null && !blocked.has(i.userId!));

  const items = projected.filter(i => {
    const sd = new Date(i.scheduledDelete);
    return sd >= from && sd <= to;
  }).map(({ userId, ...rest }) => rest);

  const overdue = projected.filter(i => {
    const sd = new Date(i.scheduledDelete);
    return sd < from; // already due/past
  }).map(({ userId, ...rest }) => rest);

  return { windowDays, delayDays, items, overdue };
}





// ---------- runs ----------
/** DB-only: mark internships Inactive + delete portal user rows */
export async function runDeprovisionOnce() {
  const due = await listDueCandidates();
  const dueFiltered = due;
  if (!due.length) {
    await prisma.deprovisionPolicy.update({ where: { id: 1 }, data: { lastRunAt: new Date(), lastDeleted: 0 } });
    return { ok: true, deletedCount: 0, google: { attempted: 0, succeeded: 0, failed: 0 } };
  }

  const internIds = Array.from(new Set(due.map(d => d.internId)));
  const userIds   = Array.from(new Set(due.map(d => d.userId)));

  const [inact, delUsers] = await prisma.$transaction([
    prisma.internshipInfo.updateMany({
      where: { internId: { in: internIds }, status: { not: $Enums.InternshipStatus.Inactive } },
      data:  { status: $Enums.InternshipStatus.Inactive },
    }),
    prisma.user.deleteMany({
      where: { id: { in: userIds } },
    }),

  ]);

  await prisma.deprovisionPolicy.update({ where: { id: 1 }, data: { lastRunAt: new Date(), lastDeleted: delUsers.count } });

  return {
    ok: true,
    deletedCount: delUsers.count,
    internshipsInactivated: inact.count,
    google: { attempted: 0, succeeded: 0, failed: 0 },
  };
}

/** Google → then DB */
export type DeprovOpts = { skipUserIds?: number[] };

export async function runGoogleThenDbOnce(opts: DeprovOpts = {}) {
  const skip = new Set(opts.skipUserIds ?? []);
  const pol = await getPolicyDb();
  const all = await listDueCandidates();
const due = (opts.skipUserIds && opts.skipUserIds.length)
  ? all.filter(d => !opts.skipUserIds!.includes(d.userId))
  : all;

  let attempted = 0, succeeded = 0, failed = 0;
  const transfers: Array<{ email: string | null; transferId: string | null; ok: boolean; error?: string }> = [];

  if (due.length) {
    const results = await Promise.allSettled(
      due.map(d =>
        d.companyEmail
          ? googleDeleteUser({ fromEmail: d.companyEmail, transferToEmail: pol.transferTargetEmail || undefined })
          : Promise.reject(new Error('no_company_email'))
      )
    );
    attempted = results.length;
    results.forEach((res, idx) => {
      const email = due[idx].companyEmail;
      if (res.status === 'fulfilled') {
        succeeded++;
        transfers.push({ email, transferId: (res.value as any).transferId ?? null, ok: true });
      } else {
        failed++;
        transfers.push({ email, transferId: null, ok: false, error: (res.reason as any)?.message || String(res.reason) });
      }
    });
  }

  const internIds = Array.from(new Set(due.map(d => d.internId)));
const userIds   = Array.from(new Set(due.map(d => d.userId)));

let deletedCount = 0;
let inactivated = 0;
let detached = 0;

if (due.length) {
  const [inact, nulled, delUsers] = await prisma.$transaction([
    prisma.internshipInfo.updateMany({
      where: { internId: { in: internIds }, status: { not: $Enums.InternshipStatus.Inactive } },
      data:  { status: $Enums.InternshipStatus.Inactive },
    }),

    // IMPORTANT: detach intern from portal user so "inactive" stays consistent
    prisma.internDetail.updateMany({
      where: { userId: { in: userIds } },
      data:  { userId: null },
    }),

    // Delete the portal login user record
    prisma.user.deleteMany({
      where: { id: { in: userIds } },
    }),
  ]);

  inactivated = inact.count;
  detached = nulled.count;
  deletedCount = delUsers.count;
}


  await prisma.deprovisionPolicy.update({
    where: { id: 1 },
    data: { lastRunAt: new Date(), lastDeleted: deletedCount },
  });

  return {
  ok: true,
  deletedCount,
  internshipsInactivated: inactivated,
  internDetailsDetached: detached,
  emails: due.map(d => d.companyEmail),
  google: { attempted, succeeded, failed, transfers },
};

}


// Deprovision a single user immediately if due.
// "Due" if: (a) policy says it's due  OR  (b) endDate <= (today - 1 day)
export async function deprovisionIfDueForUserId(userId: number) {
  // resolve intern + latest endDate + email
  const detail = await prisma.internDetail.findFirst({
    where: { userId },
    select: { internId: true, userId: true, user: { select: { id: true, companyEmail: true } } },
  });
  if (!detail?.internId) return { ok: true, skipped: 'no_intern' as const };

  const latest = await prisma.internshipInfo.findFirst({
    where: { internId: detail.internId, endDate: { not: null } },
    orderBy: { startDate: 'desc' },
    select: { endDate: true, internId: true },
  });
  if (!latest?.endDate) return { ok: true, skipped: 'no_end_date' as const };

  const pol = await getPolicyDb();
  const today = new Date(); today.setHours(0,0,0,0);

  // policy cutoff
  const policyCutoff = (function () {
    const delayDays =
      (pol.delayUnit === 'weeks' ? pol.delayAmount * 7 :
       pol.delayUnit === 'months' ? pol.delayAmount * 30 :
       pol.delayAmount);
    const d = new Date(today);
    d.setDate(d.getDate() - delayDays);
    d.setHours(23,59,59,999);
    return d;
  })();

  // hard cutoff = yesterday 23:59
  const yday = new Date(today); yday.setDate(yday.getDate() - 1); yday.setHours(23,59,59,999);

  const end = latest.endDate;
  const due = (pol.enabled && end <= policyCutoff) || end <= yday;
  if (!due) return { ok: true, skipped: 'not_due' as const, endDate: end };

  const email = detail.user?.companyEmail?.trim() || null;

  // best-effort Google delete
  let googleOk = false;
  try {
    if (email) {
      const r = await googleDeleteUser({ fromEmail: email, transferToEmail: pol.transferTargetEmail || undefined });
      googleOk = !!r;
    }
  } catch { /* ignore */ }

  // DB: mark internships inactive and delete portal user
  const [inact, delUser] = await prisma.$transaction([
    prisma.internshipInfo.updateMany({
      where: { internId: detail.internId, status: { not: $Enums.InternshipStatus.Inactive } },
      data:  { status: $Enums.InternshipStatus.Inactive },
    }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);

  await prisma.deprovisionPolicy.update({
    where: { id: 1 },
    data: { lastRunAt: new Date(), lastDeleted: (delUser.count || 0) },
  });

  return {
    ok: true,
    deletedUser: delUser.count,
    internshipsInactivated: inact.count,
    googleOk,
    email,
    internId: detail.internId,
  };
}




// ---------- cron ----------
let cronTask: ScheduledTask | null = null;
let cronRunning = false;

export function startDeprovisionCron() {
  const expr = process.env.DEPROVISION_CRON || '5 0 * * *'; // 00:05 daily
  const timezone =
    process.env.DEPROVISION_TZ ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Europe/Rome';

  if (cronTask) {
    console.log('Deprovision cron already scheduled');
    return;
  }

  cronTask = cron.schedule(
    expr,
    async () => {
      if (cronRunning) {
        console.log('Deprovision cron: previous run still in progress, skipping.');
        return;
      }
      cronRunning = true;
      try {
        const pol = await getPolicyDb();
        if (!pol.enabled) {
          console.log('Deprovision cron: policy disabled, skipping.');
        } else {
          console.log('Deprovision cron: runGoogleThenDbOnce()');
          const out = await runGoogleThenDbOnce();
          console.log('Deprovision cron result:', JSON.stringify({ deleted: out.deletedCount, inactivated: out.internshipsInactivated, attempted: out.google.attempted }));
        }
      } catch (e: any) {
        console.error('Deprovision cron error:', e?.message || e);
      } finally {
        cronRunning = false;
      }
    },
    { timezone }
  );

  console.log(`Deprovision cron scheduled: "${expr}" TZ=${timezone}`);
} 
