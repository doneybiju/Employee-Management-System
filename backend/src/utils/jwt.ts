// backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET as string;

export type JwtRole = 'intern' | 'hr' | 'super_admin';
export type EmpType = 'intern' | 'employee' | 'team_lead';

export type Payload = {
  sub: string;
  role?: JwtRole;
  email?: string;
  firstName?: string;
  surname?: string;
  empType?: EmpType;              // ← add this
  mustChangePassword?: boolean;   // optional, if you ever include it
};

export function signJwt(payload: Payload, opts?: jwt.SignOptions): string {
  // default 30 minutes
  return jwt.sign(payload, SECRET, { expiresIn: '30m', ...(opts || {}) });
}

export function verifyJwt<T = Payload>(token: string): { valid: boolean; expired: boolean; payload?: T } {
  try {
    const payload = jwt.verify(token, SECRET) as T;
    return { valid: true, expired: false, payload };
  } catch (e: any) {
    if (e?.name === 'TokenExpiredError') return { valid: false, expired: true };
    return { valid: false, expired: false };
  }
}
