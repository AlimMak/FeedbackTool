# Architecture: Multi-Tenancy

This document explains how tenant isolation works in this codebase, why the
approach was chosen, and the tradeoffs involved.

## TL;DR

- **One database, one schema, shared by all tenants.**
- Every tenant-owned row carries its tenant key (`organization_id`).
- Isolation is enforced by **Postgres Row-Level Security (RLS)**, not by
  application `WHERE` clauses — so a forgotten filter can't leak data across
  tenants. Isolation is a **database invariant**, not a coding convention.
- The app connects as a **restricted role** (`saas_app`) that RLS applies to,
  and sets the current tenant in a per-transaction session variable
  (`app.current_tenant`). Migrations/seed/admin use a separate **owner role**
  (`saas_owner`) that bypasses RLS on purpose.

---

## The tenant model

The **Organization** is the tenant. "Tenant id" in this codebase *is* the
Organization id.

| Table           | Tenant-owned? | Tenant key        | RLS |
| --------------- | ------------- | ----------------- | --- |
| `organizations` | yes (it *is* the tenant) | `id`     | ✅  |
| `memberships`   | yes           | `organization_id` | ✅  |
| `boards`        | yes           | `organization_id` | ✅  |
| `users`         | **no** (global identity) | —      | ❌  |

**Why `users` is global.** A person can belong to more than one organization
(the seed's "Dave" is a member of both orgs). Identity is therefore modelled
once, globally, and the **Membership** join table maps a user into an
organization *with a role* (`OWNER` / `MEMBER`). If `users` were tenant-owned we
couldn't represent a single human across tenants without duplicating them.

---

## Why shared-database + RLS

There are three common ways to isolate tenants. The tradeoffs:

| Approach | Isolation | Ops cost | Cross-tenant queries | Main risk |
| --- | --- | --- | --- | --- |
| **Database per tenant** | Strongest (physical) | High — migrate/backup/connection-pool per tenant, expensive at N tenants | Hard | Operational fan-out |
| **Schema per tenant** | Strong | Medium — migration fan-out, catalog bloat with many tenants | Medium | Scaling number of schemas |
| **Shared DB + shared schema (this repo)** | Logical, DB-enforced via RLS | Low — one schema, one migration, one pool | Easy (as owner) | A bug that bypasses RLS |

This project chose **shared DB + shared schema + RLS** because it keeps
operational cost low (a single migration path and connection pool) while still
enforcing isolation *in the database* rather than trusting every query to be
written correctly.

### Shared schema *without* RLS is the trap

The naive shared-schema approach isolates tenants with an application-level
`WHERE organization_id = $current` on every query. It works until the one time
someone forgets the clause — then rows leak across tenants with no error. RLS
inverts the default: **the database refuses to show other tenants' rows**, even
if the application query has no tenant filter at all. You can see this in
`app/page.tsx` — the board/member queries carry *no* `where: { organizationId }`
and are still correctly scoped.

---

## How enforcement actually works

### 1. Two Postgres roles

| Role         | Owns tables? | Superuser / BYPASSRLS | RLS applies? | Used for |
| ------------ | ------------ | --------------------- | ------------ | -------- |
| `saas_owner` | yes          | no (but is the owner) | **no**       | migrations, seed, trusted cross-tenant/admin work |
| `saas_app`   | no           | no                    | **yes**      | the running application |

Postgres bypasses RLS for **superusers**, roles with **BYPASSRLS**, and the
**table owner** (unless the table is set to `FORCE ROW LEVEL SECURITY`). We rely
on exactly that:

- `saas_owner` owns the tables, so it bypasses RLS. That is *intentional* —
  migrations and seeding are inherently cross-tenant, and admin/analytics work
  needs to see everything.
- `saas_app` is a plain login role: not a superuser, not the owner, no
  BYPASSRLS. Every query it runs is filtered by the policies.

This is why the app **must** talk to the database as `saas_app`
(`APP_DATABASE_URL`), never as `saas_owner`. `lib/prisma.ts` (the owner client)
is documented as system-only; `lib/tenant-db.ts` (the app client) is the one
that serves user requests.

> **Design note — why not `FORCE ROW LEVEL SECURITY` on a single role?**
> You *can* run everything as one role and `FORCE` RLS so even the owner is
> filtered. But then seeding and admin work would themselves need a tenant
> context, and inserting a brand-new organization becomes a chicken-and-egg
> problem (you'd need the org's own id in the session variable before the row
> exists). Splitting into an owner role (trusted, bypasses) and an app role
> (untrusted, enforced) is simpler and models the real trust boundary.

### 2. The tenant session variable

RLS policies read a custom session variable:

```sql
CREATE POLICY tenant_isolation ON "boards"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));
```

- `USING` controls which rows are **visible** (SELECT/UPDATE/DELETE).
- `WITH CHECK` controls which rows may be **written** (INSERT/UPDATE) — this is
  what rejects an attempt to insert a row for *another* tenant.
- `current_setting('app.current_tenant', true)` — the `true` (`missing_ok`)
  makes it return `NULL` when the variable is unset. Comparing against `NULL`
  yields no matches, so a connection with **no tenant context sees no
  tenant-owned rows**. This is *default-deny*: forgetting to set the tenant
  fails closed (empty results), not open (all tenants).

### 3. `withTenant()` and connection-pool safety

The tenant variable is set per request by `withTenant()` in `lib/tenant-db.ts`:

```ts
export async function withTenant<T>(tenantId, query) {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return query(tx);
  });
}
```

Two details matter:

1. **`set_config(..., is_local => true)` is the function form of `SET LOCAL`.**
   The value lives only until the end of the current transaction and is then
   discarded. It cannot bleed into the next request that reuses the same pooled
   connection.
2. **Everything runs inside one `$transaction`.** Prisma pins a single
   connection for the duration of the callback, guaranteeing the `SET LOCAL` and
   the subsequent queries execute on the *same* connection. (Setting the
   variable and then querying on a different pooled connection would silently
   lose the tenant context — and, thanks to default-deny, return nothing rather
   than leak.)

Because the setting is transaction-local, this design is also safe behind a
transaction-mode connection pooler (e.g. PgBouncer): the tenant context begins
and ends within the transaction the pooler multiplexes.

### 4. Parameterization

`SET LOCAL app.current_tenant = '<value>'` can't be parameterized directly, so
`withTenant` uses `set_config(name, value, is_local)` with the tenant id passed
as a **bound parameter**. A tenant id can never be used for SQL injection.

---

## Security properties (and how they were verified)

The RLS layer was checked directly against Postgres as the `saas_app` role:

| Property | Behaviour |
| --- | --- |
| **Default deny** | No tenant set → `SELECT` on tenant tables returns 0 rows. |
| **Read scoping** | Tenant = Acme → sees only Acme's 3 boards. |
| **No cross-tenant read** | Tenant = Globex, querying Acme's boards by id → 0 rows. |
| **No cross-tenant write** | Tenant = Globex, `INSERT` a board for Acme → `new row violates row-level security policy`. |

The `/` page runs the same read-scoping and cross-tenant probe live and renders
an "RLS isolation verified" banner.

---

## Tradeoffs & limitations

Honest downsides of this approach, and how they're mitigated here:

- **Blast radius of an RLS mistake.** Because all tenants share tables, a
  missing policy on a *new* tenant-owned table, or accidental use of the owner
  client to serve a request, leaks across tenants. Mitigations: default-deny
  policies, a documented owner-vs-app client split, and a rule that every new
  tenant-owned table gets `ENABLE ROW LEVEL SECURITY` + a `tenant_isolation`
  policy in the same migration. This deserves a test in CI as the schema grows.
- **Noisy neighbours.** Shared tables and one connection pool mean one tenant's
  load can affect others. Shared-DB tenancy trades isolation for efficiency;
  very large tenants may eventually need sharding or extraction.
- **No physical isolation / data residency.** All tenants live in one database.
  Compliance regimes that require per-customer physical separation or regional
  data residency would push toward database-per-tenant.
- **Per-query overhead.** RLS appends a predicate to every query. It's cheap but
  not free, and depends on indexes — hence the `@@index([organizationId])` on
  `memberships` and `boards`.
- **`users` is readable app-wide.** The global `users` table isn't tenant-scoped
  (a person spans orgs), so the app role can read any user row. Membership
  relationships are still tenant-scoped; if user *enumeration* became a concern
  you'd expose users only through membership joins or add a view.

---

## What's deliberately not here yet

- **Auth.** Today `withTenant()` is called explicitly (the demo page iterates
  the orgs). The next step is to derive the tenant from the authenticated
  session — resolve the user's active organization, check their Membership, and
  wrap request handlers / server actions in `withTenant(activeOrgId, …)`.
- **Billing.**
- **Automated RLS regression tests** asserting default-deny and cross-tenant
  denial as the schema evolves.
- **Production connection management** (a pooler such as PgBouncer/Prisma
  Accelerate) — the transaction-local tenant variable is already compatible with
  transaction-mode pooling.
