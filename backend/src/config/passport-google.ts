import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '../prisma';
import { signJwt } from '../utils/jwt';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Google Auth: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
      passReqToCallback: true,
    },
    async (_req, _accessToken, _refreshToken, profile, done) => {
      try {
        const emails = profile.emails || [];
        const emailObj = emails.find((e) => e.value);
        const email = emailObj?.value;

        if (!email) {
          return done(new Error('No email found in Google profile'), false);
        }

        // Query database
        const user = await prisma.user.findFirst({
          where: { companyEmail: { equals: email, mode: 'insensitive' } },
          select: { id: true, companyEmail: true, role: true, empType: true, firstName: true, surname: true, blocked: true },
        });

        if (!user) {
           // User not found
           return done(null, false, { message: 'User not found' });
        }

        if (user.blocked) {
           return done(null, false, { message: 'Account blocked' });
        }

        // Generate JWT
        const token = signJwt({
          sub: String(user.id),
          role: user.role,
          email: user.companyEmail,
          empType: user.empType,
          firstName: user.firstName,
          surname: user.surname,
        });

        // Pass token to callback
        return done(null, { token });
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

export default passport;
