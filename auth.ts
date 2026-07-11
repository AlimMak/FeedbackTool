import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { adminPrisma } from "@/lib/prisma";

/**
 * Auth.js entry point.
 *
 * Adds the Credentials provider (email + bcrypt password) on top of the
 * database-free `authConfig`. Sign-in verification reads the **global** `users`
 * table and the caller's own memberships via the owner client (`adminPrisma`):
 * this is a legitimate cross-tenant/system read keyed to the identity being
 * authenticated, before any tenant context exists.
 *
 *   * `handlers`        — GET/POST for app/api/auth/[...nextauth]/route.ts
 *   * `auth`            — read the session in RSC / route handlers / actions
 *   * `signIn`/`signOut`— used by the auth server actions
 *   * `unstable_update` — mutate the JWT to switch the active organization
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await adminPrisma.user.findUnique({
          where: { email },
          include: {
            // Seed the initial active org with the user's first membership
            // (deterministic by creation order). Users with no membership sign
            // in with a null active org and land on an empty-state dashboard.
            memberships: { orderBy: { createdAt: "asc" }, take: 1 },
          },
        });

        // No such user, or a federated user with no password set.
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          activeOrgId: user.memberships[0]?.organizationId ?? null,
        };
      },
    }),
  ],
});
