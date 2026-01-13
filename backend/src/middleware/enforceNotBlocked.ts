import prisma from '../prisma';
import type { Request, Response, NextFunction } from 'express';

export async function enforceNotBlocked(req: Request, res: Response, next: NextFunction) {
  const id = Number((req as any)?.user?.id);
  if (!id) return res.status(401).json({ error: 'unauthorized' });
  const u = await prisma.user.findUnique({ where: { id }, select: { blocked: true } });
  if (u?.blocked) return res.status(403).json({ error: 'access_revoked' });
  next();
}
