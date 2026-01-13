// backend/src/middleware/authorize.ts
import { Response, NextFunction } from 'express';
import passport from '../auth/passport';

type Role = 'intern' | 'hr' | 'super_admin';

// Usage: app.get('/path', ...authorize('hr','super_admin'), handler)
export function authorize(...roles: Role[]) {
  return [
    passport.authenticate('jwt', { session: false }),
    (req: any, res: Response, next: NextFunction) => {
      if (!req.user) return res.sendStatus(401);
      if (roles.length && !roles.includes(req.user.role as Role)) {
        return res.sendStatus(403);
      }
      next();
    },
  ];
}

export default authorize;
