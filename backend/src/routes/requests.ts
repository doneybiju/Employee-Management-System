// backend/src/routes/requests.ts
import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authorize } from '../middleware/authorize';
import { Prisma } from '@prisma/client';
import { sendTemplateMail } from '../lib/mailer';

const router = Router();

const MIN_ALLOWED = 15 * 60; // 15:00
const MAX_ALLOWED = 18 * 60; // 18:00

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const dayStart = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const parseYMD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const isWeekendUTC = (d: Date) => { const wd = new Date(d).getUTCDay(); return wd === 0 || wd === 6; };

// toggle weekend policy by env (default: skip)
const SKIP_WEEKENDS_FOR_EXTRA_HOURS =
  (process.env.EXTRA_HOURS_SKIP_WEEKENDS ?? 'true') === 'true';

/**
 * POST /api/requests
 * body:
 *  { kind:'EXTRA_HOURS'|'ABSENCE',
 *    mode:'single'|'range',
 *    date?: 'YYYY-MM-DD',
 *    startDate?: 'YYYY-MM-DD', endDate?: 'YYYY-MM-DD',
 *    start?: 'HH:MM', end?: 'HH:MM',   // only for EXTRA_HOURS
 *    reason?: string,                  // ABSENCE only
 *    comment?: string }                // ABSENCE optional
 */
router.post('/', authorize('intern', 'hr', 'super_admin'), async (req: Request, res: Response) => {
  const userId = (req as any).user.id as number;
  const { kind, mode, date, startDate, endDate, start, end, reason } = req.body ?? {};
  if (!['EXTRA_HOURS', 'ABSENCE'].includes(kind)) return res.status(400).json({ error: 'invalid kind' });
  if (!['single', 'range'].includes(mode)) return res.status(400).json({ error: 'invalid mode' });

  let startMin: number | undefined, endMin: number | undefined, minutes: number | undefined;
  if (kind === 'EXTRA_HOURS') {
    if (!start || !end) return res.status(400).json({ error: 'start/end required' });
    startMin = toMin(String(start));
    endMin = toMin(String(end));
    if (startMin < MIN_ALLOWED || endMin > MAX_ALLOWED || startMin >= endMin) {
      return res.status(400).json({ error: 'Allowed window 15:00–18:00' });
    }
    minutes = endMin - startMin;
  }

  type CreateOneResult = { created: boolean; duplicate: boolean; skippedWeekend: boolean };

  const createOne = async (d: Date): Promise<CreateOneResult> => {
    if (kind === 'EXTRA_HOURS' && SKIP_WEEKENDS_FOR_EXTRA_HOURS && isWeekendUTC(d)) {
      return { created: false, duplicate: false, skippedWeekend: true };
    }
    try {
      await prisma.employeeRequest.create({
        data: {
          userId,
          kind,
          date: mode === 'single' ? dayStart(d) : null,
          rangeStart: mode === 'range' ? dayStart(parseYMD(req.body.startDate)) : null,
          rangeEnd:   mode === 'range' ? dayStart(parseYMD(req.body.endDate))   : null,
          startMin,
          endMin,
          minutes,
          // ABSENCE only
          reason:  kind === 'ABSENCE' ? (reason ? String(reason) : null) : null,
          comment: kind === 'ABSENCE' ? (req.body?.comment ? String(req.body.comment) : null) : null,
        },
        select: { id: true },
      });
      return { created: true, duplicate: false, skippedWeekend: false };
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { created: false, duplicate: true, skippedWeekend: false };
      }
      throw e;
    }
  };

  // Block weekend EXTRA_HOURS for single-day with a 400 error
  if (kind === 'EXTRA_HOURS' && mode === 'single') {
    if (!date) return res.status(400).json({ error: 'date required' });
    const d = parseYMD(date);
    if (isWeekendUTC(d)) {
      return res.status(400).json({
        error: 'WEEKEND_NOT_ALLOWED',
        message: 'Extra hours cannot be requested on weekends. Please pick a weekday.',
      });
    }
  }

  if (mode === 'single') {
    if (!date) return res.status(400).json({ error: 'date required' });
    const r = await createOne(parseYMD(date));
    return res.json({ created: r.created ? 1 : 0, duplicate: !!r.duplicate, skippedWeekend: !!r.skippedWeekend });
  }

  // --- range mode ---
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate/endDate required' });
  const a = dayStart(parseYMD(startDate));
  const b = dayStart(parseYMD(endDate));
  if (a > b) return res.status(400).json({ error: 'startDate must be <= endDate' });

  // For EXTRA_HOURS, block ranges that include a weekend
  if (kind === 'EXTRA_HOURS') {
    const cur = new Date(a);
    while (cur <= b) {
      if (isWeekendUTC(cur)) return res.status(400).json({ error: 'WEEKEND_NOT_ALLOWED' });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Prevent exact duplicate range request
  const existing = await prisma.employeeRequest.findFirst({
    where: {
      userId,
      kind,
      date: null,
      rangeStart: a,
      rangeEnd: b,
      startMin: startMin ?? null,
      endMin:   endMin   ?? null,
      minutes:  minutes  ?? null,
      reason:   kind === 'ABSENCE' ? (reason ? String(reason) : null) : null,
    },
    select: { id: true },
  });
  if (existing) return res.json({ created: 0, duplicate: 1, skippedWeekend: 0 });

  await prisma.employeeRequest.create({
    data: {
      userId,
      kind,
      date: null,
      rangeStart: a,
      rangeEnd: b,
      startMin,
      endMin,
      minutes,
      reason:  kind === 'ABSENCE' ? (reason ? String(reason) : null) : null,
      comment: kind === 'ABSENCE' ? (req.body?.comment ? String(req.body.comment) : null) : null,
    },
    select: { id: true },
  });

  return res.json({ created: 1, duplicate: 0, skippedWeekend: 0 });
});

/**
 * GET /api/requests – always returns ALL PENDING requests (no filters).
 */
router.get('/', authorize('hr', 'super_admin'), async (_req: Request, res: Response) => {
  const rows = await prisma.employeeRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ submittedAt: 'desc' }],
    include: { user: { select: { firstName: true, surname: true, companyEmail: true } } },
  });

  res.json(rows.map(r => ({
    id: r.id,
    kind: r.kind,
    name: `${r.user.firstName} ${r.user.surname}`,
    email: r.user.companyEmail,
    date:       r.date       ? r.date.toISOString().slice(0, 10)       : undefined,
    rangeStart: r.rangeStart ? r.rangeStart.toISOString().slice(0, 10) : undefined,
    rangeEnd:   r.rangeEnd   ? r.rangeEnd.toISOString().slice(0, 10)   : undefined,
    startMin: r.startMin ?? undefined,
    endMin:   r.endMin   ?? undefined,
    minutes:  r.minutes  ?? undefined,
    reason:   r.kind === 'ABSENCE' ? (r.reason ?? null)   : null,
    comment:  r.kind === 'ABSENCE' ? (r.comment ?? null)  : null,
    status: r.status,
    submittedAt: r.submittedAt.toISOString(),
    reviewNote:  r.reviewNote,
    reviewedAt:  r.reviewedAt ? r.reviewedAt.toISOString() : undefined,
    reviewerId:  r.reviewerId ?? undefined,
  })));
});

/** PATCH /api/requests/:id/review { action:'approve'|'reject', note?:string } */
router.patch('/:id/review', authorize('hr', 'super_admin'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const reviewerId = (req as any).user.id as number;
  const action = String(req.body?.action || '').toLowerCase();
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'invalid action' });

  try {
    // Common: pull request + user (including personalEmail via employeeDetails)
    const reqRow = await prisma.employeeRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            empId: true,
            companyEmail: true,
            employeeDetails: {
              select: { email: true },
              take: 1, // assumes the first one is relevant/active
            },
          },
        },
      },
    });
    if (!reqRow) return res.status(404).json({ error: 'not_found' });

    // Reviewer name (for email + sheets)
    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { firstName: true, surname: true },
    });
    const approvedBy = reviewer ? `${reviewer.firstName} ${reviewer.surname}` : 'HR';

    // Prepare email variables
    const kindLabel = reqRow.kind === 'EXTRA_HOURS' ? 'Extra Hours' : 'Absence';
    const dateLabel =
      reqRow.date
        ? reqRow.date.toISOString().slice(0, 10)
        : (reqRow.rangeStart && reqRow.rangeEnd
            ? `${reqRow.rangeStart.toISOString().slice(0, 10)} → ${reqRow.rangeEnd.toISOString().slice(0, 10)}`
            : '—');

    const timeStr = (v?: number | null) => (v == null ? '' : `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`);
    const windowLabel = (reqRow.startMin != null && reqRow.endMin != null)
      ? `${timeStr(reqRow.startMin)}–${timeStr(reqRow.endMin)}`
      : '';

    // Reason line: combine request reason and comment
    const reasonParts: string[] = [];
    if (reqRow.reason) reasonParts.push(`Reason: ${reqRow.reason}`);
    if (reqRow.comment) reasonParts.push(`Comment: ${reqRow.comment}`);
    const reasonLine = reasonParts.join('\n');

    const noteLine = note ? `Reviewer note: ${note}` : '';

    const recipientName = `${reqRow.user.firstName} ${reqRow.user.surname}`.trim() || reqRow.user.companyEmail;

    // Determine recipient email: try companyEmail, fallback to personalEmail
    const personalEmail = reqRow.user.employeeDetails?.[0]?.email;
    const recipientEmail = reqRow.user.companyEmail || personalEmail;

    // Helper to send email if address exists
    const sendNotification = async (key: 'request_approved' | 'request_rejected') => {
      if (!recipientEmail) return; // Skip if no email found
      await sendTemplateMail({
        key,
        to: recipientEmail,
        data: {
          recipientName,
          kindLabel,
          dateLabel,
          windowLabel,
          reasonLine, // Combined reason + comment
          noteLine,
          approvedBy,
        },
      });
    };

    if (action === 'reject') {
      // 1. Update status to REJECTED and save note
      await prisma.employeeRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewNote: note,
          reviewerId,
          reviewedAt: new Date(),
        },
      });

      // 2. Send Email
      await sendNotification('request_rejected');

      // 3. Delete the request from DB
      await prisma.employeeRequest.delete({ where: { id } });

      return res.json({ id, deleted: true });
    }

    // --- APPROVE Flow ---

    // 1. Append to Sheets (preserve existing logic)
    const approvedAt = new Date().toISOString();

    // Sheet headers and logic
    const EH_HEADERS = [
      'Name','Surname','EmpID','Position','Exported At',
      'Date','Range Start','Range End','Start','End',
      'Approved At','Approved By'
    ];
    const AB_HEADERS = [
      'Name','Surname','EmpID','Position','Exported At',
      'Date','Range Start','Range End','Start','End','Reason',
      'Approved At','Approved By'
    ];

    // Get position name (legacy logic finding active internship)
    const empDetail = await prisma.employeeDetail.findFirst({
      where: { userId: reqRow.user.id },
      include: {
        internships: {
          where: { status: 'Active' },
          include: { position: true },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });
    const positionName = empDetail?.internships?.[0]?.position?.name ?? '';

    const commonCols = [
      reqRow.user.firstName,
      reqRow.user.surname,
      reqRow.user.empId,
      positionName,
      new Date().toISOString(), // Exported At
    ];

    try {
      const { appendRowWithHeader } = await import('../lib/sheets');
      const { getSystemConfig } = await import('../lib/systemConfig');

      const cfg = await getSystemConfig();
      const extraHoursSheet = cfg.googleSheetsExtraHours || 'Extra Hours';
      const absenceSheet    = cfg.googleSheetsAbsence   || 'Absence';

      if (reqRow.kind === 'EXTRA_HOURS') {
        const row = [
          ...commonCols,
          reqRow.date ? reqRow.date.toISOString().slice(0, 10) : '',
          reqRow.date ? '' : (reqRow.rangeStart ? reqRow.rangeStart.toISOString().slice(0, 10) : ''),
          reqRow.date ? '' : (reqRow.rangeEnd   ? reqRow.rangeEnd.toISOString().slice(0, 10)   : ''),
          timeStr(reqRow.startMin),
          timeStr(reqRow.endMin),
          approvedAt,
          approvedBy,
        ];
        await appendRowWithHeader(extraHoursSheet, EH_HEADERS, row);
      } else {
        const row = [
          ...commonCols,
          '', // Date (single)
          reqRow.rangeStart ? reqRow.rangeStart.toISOString().slice(0, 10) : '',
          reqRow.rangeEnd   ? reqRow.rangeEnd.toISOString().slice(0, 10)   : '',
          '', // Start
          '', // End
          reqRow.reason ?? '',
          approvedAt,
          approvedBy,
        ];
        await appendRowWithHeader(absenceSheet, AB_HEADERS, row);
      }
    } catch (sheetErr) {
      console.warn('Sheets append failed:', sheetErr);
      return res.status(502).json({ error: 'sheets_append_failed' });
    }

    // 2. Send Email
    await sendNotification('request_approved');

    // 3. Delete the request
    await prisma.employeeRequest.delete({ where: { id } });

    return res.json({ id, deleted: true });

  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    console.error(e);
    return res.status(500).json({ error: 'update_failed' });
  }
});

/** (optional) GET /api/requests/me – employee’s own history */
router.get('/me', authorize('intern', 'hr', 'super_admin'), async (req: Request, res: Response) => {
  const userId = (req as any).user.id as number;
  const rows = await prisma.employeeRequest.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
  });
  res.json(rows);
});




/**
 * GET /api/requests/approved-sheet
 * Returns the Google Sheets URL where approved requests are appended.
 */
router.get('/approved-sheet', authorize('hr', 'super_admin'), async (_req: Request, res: Response) => {
  try {
    const { getSystemConfig } = await import('../lib/systemConfig');
    const cfg = await getSystemConfig();
    const spreadsheetId = cfg.googleSheetsSpreadsheetId;

    if (!spreadsheetId) {
      return res.status(404).json({ error: 'google_sheets_not_configured' });
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return res.json({ url, spreadsheetId });
  } catch (e: any) {
    console.error('[requests] approved-sheet failed:', e);
    return res.status(500).json({ error: 'failed_to_build_sheet_url' });
  }
});


export default router;
