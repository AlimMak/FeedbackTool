import "server-only";

import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";

import { adminPrisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";

/**
 * Tenant resolution for the PUBLIC, unauthenticated routes.
 *
 * Authenticated routes derive the tenant from the session's active org. Public
 * routes have no session, so the tenant comes from the URL slug. Resolving
 * `orgSlug -> orgId` has to use the owner client: RLS default-denies a
 * connection with no tenant context, so you can't read the org row to learn its
 * id before you've set the tenant. This lookup returns *only* routing identity
 * (id + display name), never tenant data.
 *
 * Once the org id is known, EVERY board/post/vote/comment query runs through
 * {@link withPublicTenant} (i.e. withTenant), so RLS is enforced exactly as on
 * the authenticated side — a public route can't read another org's rows.
 */
export async function resolvePublicOrg(
  orgSlug: string,
): Promise<{ id: string; name: string } | null> {
  if (!orgSlug) return null;
  return adminPrisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true },
  });
}

/** Run `query` under the resolved org's RLS context. */
export function withPublicTenant<T>(
  orgId: string,
  query: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenant(orgId, query);
}

/** Best-effort client IP for rate-limit keys. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}
