import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../prisma';
import { sendTemplateMail } from '../lib/mailer';

const router = Router();
const FRONTEND_BASE = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/,'');
const forgotLimiter = rateLimit({ windowMs: 15*60*1000, max: 5, standardHeaders: true, legacyHeaders: false });
const resetLimiter  = rateLimit({ windowMs: 15*60*1000, max: 10, standardHeaders: true, legacyHeaders: false });

const rand = () => crypto.randomBytes(32).toString('hex');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** POST /api/password/forgot */
router.post('/forgot', forgotLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  res.status(200).json({ ok: true }); // no enumeration
  if (!email) return;

  const user = await prisma.user.findFirst({ where: { companyEmail: { equals: email, mode: 'insensitive' } } }).catch(()=>null);
  if (!user) return;

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }).catch(()=>null);

  const token = rand();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 30*60*1000),
      ip: req.ip || undefined,
      userAgent: req.get('user-agent') || undefined,
    },
  });

  const link = `${FRONTEND_BASE}/change-password?token=${token}`;
  await sendTemplateMail({
  key: 'forgot_password',
  to: email,
  data: {
    recipientName: user.firstName || 'there',
    resetUrl: link,
  },
}).catch(() => null);

});

/** POST /api/password/reset */
router.post('/reset', resetLimiter, async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword) return res.status(400).json({ error: 'invalid_input' });

  const strong =
    newPassword.length >= 12 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword) &&
    !/\s/.test(newPassword);
  if (!strong) return res.status(400).json({ error: 'weak_password' });

  const rec = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!rec) return res.status(400).json({ error: 'invalid_or_expired' });

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { password: hash, mustChangePassword: false } }),
    prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
  ]);

  res.json({ ok: true });
});

export default router;
