// backend/src/routes/auth.ts
import { Router, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcrypt';

import { UAParser } from 'ua-parser-js';
import { geoLookup } from '../lib/geoip';
import prisma from '../prisma';
import { signJwt } from '../utils/jwt';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import { recordAlertsForLogin } from '../lib/alerts';


const router = Router();

/** ---- Login limiter: 3 failed attempts / 15 minutes (per IP+email) ---- */
const MAX_LOGIN_ATTEMPTS = 3;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: MAX_LOGIN_ATTEMPTS,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req); // IPv6-safe
    const email = (req.body?.email || req.body?.companyEmail || '')
      .toString().trim().toLowerCase();
    return email ? `${ipKey}:${email}` : ipKey;
  },
  handler: (req, res, _next, options) => {
    const limit = options.max ?? MAX_LOGIN_ATTEMPTS;
    const rl: any = (req as any).rateLimit;
    const resetMs =
      (rl?.resetTime instanceof Date ? rl.resetTime.getTime() : undefined) ??
      (Date.now() + (options.windowMs ?? 15 * 60 * 1000));
    const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
    res.status(options.statusCode).json({
      error: 'TOO_MANY_LOGIN_ATTEMPTS',
      message:
        'Too many failed login attempts. Your account is temporarily blocked. Please try again in 15 minutes or contact the IT Department.',
      limit,
      remainingAttempts: 0,
      retryAfterSeconds,
    });
  },
});

function attemptsLeftForThisFailure(req: Request) {
  const rl: any = (req as any).rateLimit;
  const limit = rl?.limit ?? MAX_LOGIN_ATTEMPTS;
  const remainingBefore = typeof rl?.remaining === 'number' ? rl.remaining : limit;
  const remainingAfterFail = Math.max(0, remainingBefore - 1);
  return { limit, remaining: remainingAfterFail, rl };
}

function pick(s: string | undefined | null, max = 255) {
  return s ? String(s).slice(0, max) : undefined;
}

function getClientIp(req: Request) {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined) || '';
  const first = fwd.split(',')[0].trim();
  const raw = first || req.ip || '';
  // map IPv6 localhost to IPv4 for cleaner display/geo
  return raw === '::1' ? '127.0.0.1' : raw;
}

async function logLogin(opts: {
  req: Request;
  userId?: number | null;
  email?: string | null;
  success: boolean;
  failReason?:
    | 'RATE_LIMITED'
    | 'MISSING_FIELDS'
    | 'NO_SUCH_USER'
    | 'WRONG_PASSWORD'
    | 'BLOCKED'
    | 'TEMP_ERROR';
  statusCode: number;
}) {
  try {
    const { req, userId, email, success, failReason, statusCode } = opts;

    const ua = req.get('user-agent') || (req.body?.userAgent as string | undefined) || '';
    const parsed = new UAParser(ua || undefined).getResult();
    const ip = getClientIp(req);

    // optional client hints (sent by frontend)
    const deviceId = pick((req.get('x-device-id') || req.body?.deviceId) as string | undefined, 64);
    const fpHash   = pick((req.get('x-fp-hash')   || req.body?.fpHash)   as string | undefined, 64);
    const language = pick(
      (req.get('x-accept-language') || req.body?.language || req.get('accept-language')) as string | undefined,
      35
    );
    const screen   = pick((req.get('x-screen') || req.body?.screen) as string | undefined, 25);
    const platform = pick((req.get('x-platform') || req.body?.platform) as string | undefined, 50);
    const tzOffset = Number(req.get('x-tz-offset') ?? req.body?.tzOffset ?? NaN);
    const rl: any = (req as any).rateLimit;

    // Geo lookup (skip for local/private)
    const loc = geoLookup(ip);

    const created = await prisma.loginEvent.create({
  data: {
    userId: userId ?? null,
    email: pick(email ?? undefined, 100),
    success,
    failReason: success ? null : (failReason ?? 'TEMP_ERROR'),
    ip: pick(ip, 45)!,
    country:  loc?.country ?? null,
    region:   loc?.region  ?? null,
    city:     loc?.city    ?? null,
    lat:      loc?.lat ?? null,
    lon:      loc?.lon ?? null,
    ua: pick(ua, 255),
    browser: pick(parsed.browser?.name || undefined, 50),
    os: pick(parsed.os?.name || undefined, 50),
    deviceType: pick(parsed.device?.type || 'desktop', 30),
    deviceId,
    fpHash,
    tzOffset: Number.isFinite(tzOffset) ? Math.trunc(tzOffset) : null,
    language,
    screen,
    platform,
    rateLimitLimit: rl?.limit ?? null,
    rateLimitRemaining: rl?.remaining ?? null,
    rateLimitResetAt: rl?.resetTime instanceof Date ? rl.resetTime : null,
    statusCode,
  },
});

// evaluate security alerts (don’t block login flow if it throws)
recordAlertsForLogin(created).catch(() => {});


// On success, remember the device
if (success && userId && deviceId) {
  await prisma.knownDevice.upsert({
    where: { known_devices_user_device_uniq: { userId, deviceId } },
    create: {
      userId,
      deviceId,
      fpHash: fpHash ?? null,
      lastIp: pick(ip, 45),
      lastUa: pick(ua, 255),
      lastCountry: loc?.country ?? null,
      lastRegion:  loc?.region  ?? null,
      lastCity:    loc?.city    ?? null,
      lastLat:     loc?.lat ?? null,
      lastLon:     loc?.lon ?? null,
      trusted: true,
    },
    update: {
      lastSeen: new Date(),
      lastIp: pick(ip, 45),
      lastUa: pick(ua, 255),
      fpHash: fpHash ?? null,
      lastCountry: loc?.country ?? null,
      lastRegion:  loc?.region  ?? null,
      lastCity:    loc?.city    ?? null,
      lastLat:     loc?.lat ?? null,
      lastLon:     loc?.lon ?? null,
    },
  });
}
  } catch {
    // never break login flow on telemetry error
  }
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      const { limit, remaining } = attemptsLeftForThisFailure(req);
      await logLogin({ req, email, success: false, failReason: 'MISSING_FIELDS', statusCode: 400 });
      return res.status(400).json({ error: 'Missing credentials', remainingAttempts: remaining, limit });
    }

    const user = await prisma.user.findFirst({
      where: { companyEmail: { equals: email, mode: 'insensitive' } },
      select: { id: true, companyEmail: true, role: true, empType: true, firstName: true, surname: true, password: true, mustChangePassword: true, blocked: true }
    });

    if (!user) {
      const { limit, remaining } = attemptsLeftForThisFailure(req);
      await logLogin({ req, email, success: false, failReason: 'NO_SUCH_USER', statusCode: 401 });
      return res.status(401).json({
        error: 'Invalid credentials',
        message:
          remaining === 0
            ? 'Invalid credentials. No attempts remaining—next attempt will be blocked for 15 minutes.'
            : `Invalid credentials. ${remaining} of ${limit} attempts remaining.`,
        remainingAttempts: remaining,
        limit,
      });
    }

    if (user.blocked) {
  const { limit, remaining } = attemptsLeftForThisFailure(req);
  await logLogin({ req, email, userId: user.id, success: false, failReason: 'BLOCKED', statusCode: 403 });
  return res.status(403).json({
    error: 'ACCOUNT_BLOCKED',
    message: 'Your account is blocked. Contact IT.',
    remainingAttempts: remaining,
    limit,
  });
}

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const { limit, remaining } = attemptsLeftForThisFailure(req);
      await logLogin({ req, email, userId: user.id, success: false, failReason: 'WRONG_PASSWORD', statusCode: 401 });
      return res.status(401).json({
        error: 'Invalid credentials',
        message:
          remaining === 0
            ? 'Invalid credentials. No attempts remaining—next attempt will be blocked for 15 minutes.'
            : `Invalid credentials. ${remaining} of ${limit} attempts remaining.`,
        remainingAttempts: remaining,
        limit,
      });
    }

    // Success
    const token = signJwt({
      sub: String(user.id),
      role: user.role,
      email: user.companyEmail,
      empType: user.empType,
      firstName: user.firstName,
      surname: user.surname,
    });

    await logLogin({ req, email, userId: user.id, success: true, statusCode: 200 });

    const prod = process.env.NODE_ENV === 'production';
res.cookie('access_token', token, {
  httpOnly: true,
  sameSite: prod ? 'none' : 'lax',
  secure: prod,
  path: '/',
  maxAge: 30 * 60 * 1000,
});


    res.json({ token, mustChangePassword: !!user.mustChangePassword });
  } catch (e: any) {
    await logLogin({ req, success: false, failReason: 'TEMP_ERROR', statusCode: 500 });
    res.status(500).json({ error: e?.message || 'Login failed' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', ensureAuthenticated, async (req, res) => {
  try {
    const userId = Number((req as any).user?.id ?? (req as any).user?.sub);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const ok =
      typeof newPassword === 'string' &&
      newPassword.length >= 12 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword) &&
      !/\s/.test(newPassword);
    if (!ok) {
      return res.status(400).json({
        error:
          'Password must be 12+ chars and include upper, lower, digit, symbol, no spaces.',
      });
    }

    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!u) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, u.password);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hash, mustChangePassword: false },
    });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Change password failed' });
  }
});

// GET /api/auth/me
router.get('/me', ensureAuthenticated, async (req: any, res) => {
  const userId = Number(req.user?.id);
  if (!userId) return res.sendStatus(401);

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      companyEmail: true,
      role: true,
      firstName: true,
      surname: true,
      empType: true,
      mustChangePassword: true,
    },
  });
  if (!u) return res.sendStatus(401);
  res.json({
    id: u.id,
    email: u.companyEmail,
    role: u.role,
    firstName: u.firstName,
    surname: u.surname,
    empType: u.empType,
    mustChangePassword: !!u.mustChangePassword,
  });
});


// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  const prod = process.env.NODE_ENV === 'production';
  const base = { httpOnly: true, sameSite: prod ? 'none' : 'lax', secure: prod, path: '/' } as const;
  res.clearCookie('token', base);
  res.clearCookie('access_token', base);
  res.sendStatus(204);
});


export default router;
