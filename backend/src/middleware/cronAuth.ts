// backend/src/middleware/cronAuth.ts
import type { Request, Response, NextFunction } from 'express';

export default function cronAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.header('authorization') || '';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (tok && process.env.CRON_TOKEN && tok === process.env.CRON_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}
