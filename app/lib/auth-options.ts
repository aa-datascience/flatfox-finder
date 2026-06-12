import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Match the normalization applied at signup so login is case- and
        // whitespace-insensitive.
        const email = credentials.email.trim().toLowerCase();

        const key = `login:${email}`;
        if (isRateLimited(key)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user) {
          recordFailedAttempt(key);
          return null;
        }

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) {
          recordFailedAttempt(key);
          return null;
        }

        clearAttempts(key);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.locale = (user as { locale?: string }).locale ?? "en";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.locale = token.locale ?? "en";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
