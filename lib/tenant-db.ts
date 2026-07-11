import { PrismaClient, type Prisma } from "@prisma/client";

const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!appDatabaseUrl) {
  throw new Error(
    "APP_DATABASE_URL is not set. Copy .env.example to .env — this is the " +
      "RLS-enforced runtime connection (role `saas_app`).",
  );
}

// Cache across hot-reloads in development (see lib/prisma.ts).
const globalForPrisma = globalThis as unknown as {
  appPrisma?: PrismaClient;
};

/**
 * Runtime application client — connects as `saas_app` (APP_DATABASE_URL), a
 * role with no superuser/owner/BYPASSRLS privileges, so **Row-Level Security
 * is fully enforced** on every query.
 *
 * On its own it can see NO tenant-owned rows (the RLS default-deny). Always go
 * through {@link withTenant} to establish tenant context.
 */
export const appPrisma: PrismaClient =
  globalForPrisma.appPrisma ??
  new PrismaClient({ datasourceUrl: appDatabaseUrl });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.appPrisma = appPrisma;
}

/**
 * Run `query` with the Postgres RLS tenant context bound to `tenantId` (an
 * Organization id). The tenant is set via `set_config('app.current_tenant', …,
 * is_local => true)`, the function form of `SET LOCAL`, so it lives only for
 * the duration of the surrounding transaction and is bound to that single
 * pooled connection — no risk of tenant context leaking between requests.
 *
 * The value is passed as a bound parameter, so a tenant id can never be used
 * for SQL injection.
 *
 * @example
 *   const boards = await withTenant(orgId, (tx) => tx.board.findMany());
 */
export async function withTenant<T>(
  tenantId: string,
  query: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return query(tx);
  });
}
