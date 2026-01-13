// backend/src/middleware/forcePasswordChange.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client'; // or your prisma import

export default async function forcePasswordChange(req: Request, res: Response, next: NextFunction) {
  try {
    const uid = Number((req as any).user?.id ?? (req as any).user?.sub);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    // allow the change-password endpoint itself
    if (req.path.startsWith('/auth/change-password')) return next();

    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { mustChangePassword: true },
    });
    if (!u) return res.status(401).json({ error: 'Unauthorized' });

    if (u.mustChangePassword) {
      return res.status(428).json({ error: 'must_change_password' }); // 428 Precondition Required
    }
    next();
  } catch {
    res.status(500).json({ error: 'policy_check_failed' });
  }
}
