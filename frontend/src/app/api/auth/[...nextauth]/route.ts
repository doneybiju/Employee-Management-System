import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import prisma from "@/lib/prisma"

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables. Google SSO will not work.")
}

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "missing-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "missing-client-secret",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;

        try {
          const dbUser = await prisma.user.findUnique({
            where: { companyEmail: user.email },
          });

          return !!dbUser; // Return true if user exists, false otherwise
        } catch (error) {
          console.error("Error in signIn callback:", error);
          return false;
        }
      }
      return false; // Only allow Google login
    },
    async jwt({ token, user }) {
      // 'user' is only defined on the first call (sign in)
      if (user && user.email) {
        try {
            const dbUser = await prisma.user.findUnique({
                where: { companyEmail: user.email }
            })
            if (dbUser) {
                token.id = dbUser.id
                token.role = dbUser.role as string
                token.empType = dbUser.empType as string
            }
        } catch (error) {
            console.error("Error in jwt callback:", error)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as number
        session.user.role = token.role as string
        session.user.empType = token.empType as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
