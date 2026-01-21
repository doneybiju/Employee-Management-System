// backend/src/routes/security.ts
import { Router, Request, Response } from 'express';
import prisma from '../prisma';

const router = Router();

// ---- helpers ----
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const parseBool = (v: unknown) =>
  typeof v === 'string'
    ? v.toLowerCase() === 'true'
    : typeof v === 'boolean'
    ? v
    : undefined;

function toDateOrUndefined(s: unknown): Date | undefined {
  if (!s || typeof s !== 'string') return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function toCsv(rows: any[], headerOrder: string[]): string {
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headerOrder.join(',');
  const body = rows
    .map((r) => headerOrder.map((k) => escape(r[k])).join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}


async function addNewFlags(items: any[]) {
  for (const it of items) {
    // NEW device for this user?
    if (it.userId && it.deviceId) {
      const olderSameDevice = await prisma.loginEvent.findFirst({
        where: {
          userId: it.userId,
          deviceId: it.deviceId,
          createdAt: { lt: it.createdAt },
        },
        select: { id: true },
      });
      (it as any).isNewDevice = !olderSameDevice;
    } else {
      (it as any).isNewDevice = false;
    }

    // NEW country for this user?
    if (it.userId && it.country) {
      const olderSameCountry = await prisma.loginEvent.findFirst({
        where: {
          userId: it.userId,
          country: it.country,
          createdAt: { lt: it.createdAt },
        },
        select: { id: true },
      });
      (it as any).isNewCountry = !olderSameCountry;
    } else {
      (it as any).isNewCountry = false;
    }
  }
  return items;
}


// ---- GET /login-events (filterable + CSV) ----
router.get('/login-events', async (req: Request, res: Response) => {
  const {
    email,
    userId,
    ip,
    deviceId,
    success,
    failReason,
    start,
    end,
    sort = 'newest',
    page = '1',
    pageSize = '25',
    format,
  } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (email) where.email = { equals: email, mode: 'insensitive' };
  if (userId && !Number.isNaN(Number(userId))) where.userId = Number(userId);
  if (ip) where.ip = { contains: ip };
  if (deviceId) where.deviceId = deviceId;
  if (typeof success !== 'undefined') where.success = success?.toLowerCase() === 'true';
  if (failReason) where.failReason = failReason;

  const startAt = toDateOrUndefined(start);
  const endAt = toDateOrUndefined(end);
  if (startAt || endAt) {
    where.createdAt = {};
    if (startAt) where.createdAt.gte = startAt;
    if (endAt) where.createdAt.lte = endAt;
  }

  const take = clamp(parseInt(String(pageSize), 10) || 25, 1, 100);
  const p = clamp(parseInt(String(page), 10) || 1, 1, 10_000);
  const skip = (p - 1) * take;

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

  const [total, rawItems] = await Promise.all([
    prisma.loginEvent.count({ where }),
    prisma.loginEvent.findMany({ 
      where, 
      orderBy, 
      skip, 
      take,
      include: {
        alerts: {
          select: {
            kind: true,
            severity: true,
          }
        }
      }
    }),
  ]);

  const items = await addNewFlags(rawItems);

  if (format === 'csv') {
    const header = [
      'id','createdAt','success','failReason','statusCode','email','userId','ip',
      'country','region','city','browser','os','deviceType','deviceId','fpHash',
      'tzOffset','language','screen','platform','rateLimitLimit','rateLimitRemaining',
      'rateLimitResetAt','ua',
      // NEW:
      'isNewDevice','isNewCountry',
    ];
    const csv = toCsv(
      items.map((x: any) => ({
        ...x,
        createdAt: x.createdAt.toISOString(),
        rateLimitResetAt: x.rateLimitResetAt ? x.rateLimitResetAt.toISOString() : '',
        isNewDevice: x.isNewDevice ? '1' : '0',
        isNewCountry: x.isNewCountry ? '1' : '0',
      })),
      header
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="login-events.csv"');
    return res.status(200).send(csv);
  }

  return res.json({ total, page: p, pageSize: take, items });
});


// ---- DELETE /login-events (danger: clears logs; disabled in prod) ----
router.delete('/login-events', async (req: Request, res: Response) => {
  // Safety: don't allow mass delete in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Clearing logs is disabled in production' });
  }

  const { email } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (email) where.email = { equals: email, mode: 'insensitive' };

  const r = await prisma.loginEvent.deleteMany({ where });
  return res.json({ deleted: r.count });
});



// ---- GET /known-devices/:userId ----
router.get('/known-devices/:userId', async (req: Request, res: Response) => {
  const uid = Number(req.params.userId);
  if (!uid) return res.status(400).json({ error: 'Invalid userId' });

  const items = await prisma.knownDevice.findMany({
    where: { userId: uid },
    orderBy: { lastSeen: 'desc' },
  });

  res.json({ userId: uid, total: items.length, items });
});

// ---- GET /alerts (filterable) ----
router.get('/alerts', async (req: Request, res: Response) => {
  const { kind, severity, resolved, page = '1', pageSize = '25' } = req.query as Record<string,string|undefined>;
  const take = Math.max(1, Math.min(100, parseInt(pageSize || '25', 10)));
  const p = Math.max(1, parseInt(page || '1', 10));
  const skip = (p - 1) * take;

  const where: any = {};
  if (kind) where.kind = kind;
  if (severity) where.severity = severity;
  if (typeof resolved !== 'undefined') where.resolvedAt = resolved === 'true' ? { not: null } : null;

  const [total, items] = await Promise.all([
    prisma.securityAlert.count({ where }),
    prisma.securityAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
  ]);

  res.json({ total, page: p, pageSize: take, items });
});

// ---- PATCH /alerts/:id/resolve ----
router.patch('/alerts/:id/resolve', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const { resolved } = (req.body ?? {}) as { resolved?: boolean };
  const updated = await prisma.securityAlert.update({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  res.json(updated);
});


// ---- PATCH /known-devices/:userId/:deviceId  (toggle trust) ----
router.patch('/known-devices/:userId/:deviceId', async (req: Request, res: Response) => {
  const uid = Number(req.params.userId);
  const deviceId = String(req.params.deviceId || '');
  if (!uid || !deviceId) return res.status(400).json({ error: 'Invalid params' });

  const { trusted } = (req.body ?? {}) as { trusted?: boolean };
  if (typeof trusted !== 'boolean') {
    return res.status(400).json({ error: 'Body must include { trusted: boolean }' });
  }

  const exists = await prisma.knownDevice.findUnique({
    where: { known_devices_user_device_uniq: { userId: uid, deviceId } },
  });
  if (!exists) return res.status(404).json({ error: 'Device not found' });

  const updated = await prisma.knownDevice.update({
    where: { known_devices_user_device_uniq: { userId: uid, deviceId } },
    data: { trusted },
  });

  res.json(updated);
});

// ---- DELETE /known-devices/:userId/:deviceId ----
router.delete('/known-devices/:userId/:deviceId', async (req: Request, res: Response) => {
  const uid = Number(req.params.userId);
  const deviceId = String(req.params.deviceId || '');
  if (!uid || !deviceId) return res.status(400).json({ error: 'Invalid params' });

  const exists = await prisma.knownDevice.findUnique({
    where: { known_devices_user_device_uniq: { userId: uid, deviceId } },
  });
  if (!exists) return res.status(404).json({ error: 'Device not found' });

  await prisma.knownDevice.delete({
    where: { known_devices_user_device_uniq: { userId: uid, deviceId } },
  });

  res.sendStatus(204);
});

export default router;
