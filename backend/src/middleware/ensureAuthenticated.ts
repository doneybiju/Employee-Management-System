// backend/src/middleware/ensureAuthenticated.ts
import { Request, Response, NextFunction } from 'express';
import passport from '../auth/passport';

export default function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Accept either Authorization: Bearer <jwt> or a cookie (token / access_token)
  const hasHeader =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization.trim().toLowerCase().startsWith('bearer ');
  const hasCookie =
    (req as any)?.cookies?.token || (req as any)?.cookies?.access_token;

  if (!hasHeader && !hasCookie) {
    return res.status(401).json({ error: 'missing_token' });
  }

  return passport.authenticate(
    'jwt',
    { session: false },
    (err: unknown, user: unknown, _info: unknown) => {
      if (err) return res.status(401).json({ error: 'invalid_token' });
      if (!user) return res.status(401).json({ error: 'invalid_token' });
      (req as any).user = user;
      next();
    }
  )(req, res, next);
}
