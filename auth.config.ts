import type { NextAuthConfig } from "next-auth";

/**
 * Database-free Auth.js configuration.
 *
 * This half of the config carries no Prisma/bcrypt imports so it can be loaded
 * by `proxy.ts` (the Next.js 16 replacement for middleware) without pulling the
 * database client into that bundle. The Credentials provider — which *does*
 * touch the database — is added in `auth.ts`, which spreads this config.
 *
 * The `authorized` callback runs in Proxy on every matched request and performs
 * the *optimistic* auth check (cookie only, no DB). Real data-access checks live
 * in the Data Access Layer (lib/dal.ts) and, ultimately, in Postgres RLS.
 */
export const authConfig = {
  // JWT strategy is required by the Credentials provider (there is no database
  // session row to look up). The active-org id rides along inside the token.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  // Trust the incoming Host header (needed outside Vercel, e.g. local dev).
  trustHost: true,

  // Real providers are attached in auth.ts; kept empty here so this file stays
  // database-free for Proxy.
  providers: [],

  callbacks: {
    /**
     * Optimistic route protection, evaluated in Proxy. Returning `false`
     * redirects unauthenticated users to `pages.signIn`.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnLogin = nextUrl.pathname === "/login";

      if (isOnLogin) {
        // Already signed in? Bounce away from the login page.
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      // Everything else requires a session.
      return isLoggedIn;
    },

    /**
     * Persist the user id and active organization into the token. On sign-in
     * `user` is the object returned by `authorize()`. On an explicit
     * `unstable_update()` (org switch) the new value arrives via `session`.
     */
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.activeOrgId = user.activeOrgId;
      }
      if (trigger === "update" && session && "activeOrgId" in session) {
        token.activeOrgId = session.activeOrgId as string | null;
      }
      return token;
    },

    /** Expose the token fields on the session object read by the app. */
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id;
      }
      session.activeOrgId = token.activeOrgId ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
