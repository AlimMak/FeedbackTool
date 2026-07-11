import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";

import { auth } from "@/auth";
import { adminPrisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";

/**
 * Data Access Layer — the single place that turns an authenticated session into
 * a tenant-scoped database context.
 *
 * The flow every request follows:
 *   1. read the session (JWT cookie) → user id + active organization id
 *   2. confirm the user is really a member of that organization (defense in
 *      depth against a stale/revoked membership in an otherwise-valid token)
 *   3. run the query through `withTenant(activeOrgId, …)`, which sets the
 *      Postgres `app.current_tenant` session variable so RLS scopes every query
 *      automatically — no `where: { organizationId }` anywhere in app code.
 *
 * `cache()` memoizes these lookups for the duration of a single render pass so
 * repeated calls don't re-hit the session/DB.
 */

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  role: Role;
};

export type ActiveOrgContext = {
  userId: string;
  /** The verified active organization, or null if the user has no memberships. */
  activeOrgId: string | null;
  /** The user's role in the active organization, or null when there is none. */
  role: Role | null;
  /** Every organization the user belongs to (for the org switcher). */
  orgs: OrgSummary[];
};

/** Bare session getter, memoized per render. Does not redirect. */
export const getSession = cache(async () => auth());

/**
 * Every organization the signed-in user belongs to.
 *
 * This is inherently cross-tenant (a person can span organizations — the very
 * reason `users` is global), so it uses the owner client and is scoped to the
 * caller's own `userId`. It never exposes memberships that aren't the user's.
 */
export const getMyOrganizations = cache(
  async (userId: string): Promise<OrgSummary[]> => {
    const memberships = await adminPrisma.membership.findMany({
      where: { userId },
      orderBy: { organization: { name: "asc" } },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
    }));
  },
);

/**
 * Resolve — and verify — the active organization for the current request.
 * Redirects to /login when there is no session at all. When the token's active
 * org is stale (membership revoked) or unset, falls back to the user's first
 * organization if they have one; otherwise returns `activeOrgId: null`.
 */
export const requireActiveOrg = cache(async (): Promise<ActiveOrgContext> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const orgs = await getMyOrganizations(userId);

  // Prefer the org named in the token, but only if the user is still a member.
  const tokenOrgId = session.activeOrgId;
  const verified = tokenOrgId
    ? orgs.find((o) => o.id === tokenOrgId)
    : undefined;
  const active = verified ?? orgs[0];

  return {
    userId,
    activeOrgId: active?.id ?? null,
    role: active?.role ?? null,
    orgs,
  };
});

/**
 * Run `query` under the current user's active-organization RLS context.
 *
 * This is the auth-aware companion to {@link withTenant}: instead of being
 * handed a tenant id, it derives it from the session. All tenant-owned reads
 * and writes in request handlers / server actions should go through here.
 */
export async function withCurrentTenant<T>(
  query: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const { activeOrgId } = await requireActiveOrg();
  if (!activeOrgId) {
    // Authenticated but belongs to no organization — nothing to scope to.
    throw new Error(
      "No active organization for the current user. Guard callers with " +
        "requireActiveOrg() and render an empty state when activeOrgId is null.",
    );
  }
  return withTenant(activeOrgId, query);
}
