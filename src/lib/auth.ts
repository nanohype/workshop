import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const AUTH_EMAIL = process.env.AUTH_EMAIL || 'admin@workshop.local';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'password',
      name: 'Password',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const password = credentials?.password as string;
        if (!password || !AUTH_PASSWORD) return null;
        if (password !== AUTH_PASSWORD) return null;

        // Upsert the single user
        const existing = await db
          .select({ id: users.id, email: users.email, name: users.name, image: users.image })
          .from(users)
          .where(eq(users.email, AUTH_EMAIL))
          .limit(1);

        if (existing.length === 0) {
          const [created] = await db.insert(users).values({
            email: AUTH_EMAIL,
            name: 'Admin',
          }).returning();
          return { id: created.id, email: created.email, name: created.name, image: created.image };
        }

        const user = existing[0];
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  trustHost: true,
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.dbId) {
        session.user.id = token.dbId as string;
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if ((trigger === 'signIn' || !token.dbId) && (user?.email || token.email)) {
        try {
          const email = user?.email || (token.email as string);
          const [dbUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          if (dbUser) {
            token.dbId = dbUser.id;
          }
        } catch (error) {
          logger.error('Failed to look up user', { error: String(error) });
        }
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
});
