import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Next.js 16 renamed Middleware to "Proxy" (same functionality, Node.js
// runtime). This is the app's single proxy file. It runs the *optimistic*
// auth check from `authConfig.callbacks.authorized` on every matched request,
// redirecting unauthenticated users to /login before a page even renders.
//
// It deliberately uses the database-free `authConfig` (no Credentials provider)
// so the Prisma client is never bundled into the proxy. Authorization that
// touches data is enforced later, in the Data Access Layer and Postgres RLS.
const { auth } = NextAuth(authConfig);

export { auth as proxy };

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
