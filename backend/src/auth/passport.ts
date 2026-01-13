// backend/src/auth/passport.ts
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import prisma from '../prisma';

const cookieExtractor = (req: any) =>
  (req?.cookies?.token as string) ||
  (req?.cookies?.access_token as string) ||
  null;

const strategy = new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      cookieExtractor,
    ]),
    secretOrKey: process.env.JWT_SECRET as string,
    ignoreExpiration: false,
  },
  async (payload: any, done) => {
    try {
      const u = await prisma.user.findUnique({
        where: { id: Number(payload.sub) },
        select: { id: true, role: true, companyEmail: true, blocked: true },
      });
      if (!u || u.blocked) return done(null, false);
      return done(null, { id: u.id, role: u.role, email: u.companyEmail });
    } catch (e) {
      return done(e, false);
    }
  }
);

passport.use(strategy);

export default passport;
