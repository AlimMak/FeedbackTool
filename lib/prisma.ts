import { PrismaClient } from "@prisma/client";

// Cache the client across hot-reloads in development so we don't exhaust the
// Postgres connection pool with a new client on every module reload.
const globalForPrisma = globalThis as unknown as {
  adminPrisma?: PrismaClient;
};

/**
 * Admin / owner Prisma client — connects as `saas_owner` (DATABASE_URL), the
 * table owner, which **bypasses Row-Level Security**.
 *
 * Use this ONLY for trusted, cross-tenant "system" work: the demo page's
 * org listing, background jobs, admin tooling. NEVER use it to serve
 * tenant-scoped data in response to a user request — reach for
 * {@link withTenant} instead.
 */
export const adminPrisma: PrismaClient =
  globalForPrisma.adminPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.adminPrisma = adminPrisma;
}
