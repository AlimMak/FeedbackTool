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

### 4. Deriving the tenant from the authenticated session

`withTenant()` takes a tenant id explicitly. In request handling we never pass
one by hand — it is derived from the signed-in user's **active organization**.

- **Auth** (`auth.ts`, Auth.js / NextAuth v5) uses a Credentials provider that
  verifies an email + bcrypt password against the global `users` table. Sessions
  are stateless JWTs (required by Credentials). The token carries `id` (the User)
  and `activeOrgId` (the Organization the user is currently acting as).
- **Route protection** is an optimistic, cookie-only check in `proxy.ts` — the
  Next.js 16 successor to middleware (same behaviour, Node.js runtime). It reads
  `callbacks.authorized` from the database-free `auth.config.ts`, so the Prisma
  client is never bundled into the proxy. It redirects unauthenticated requests
  to `/login`; it is **not** the security boundary (see below).
- **The Data Access Layer** (`lib/dal.ts`) is the real boundary. `requireActiveOrg()`
  resolves the session, then re-verifies — against the owner client, keyed to the
  user's own id — that the user is still a member of the token's active org
  (a signed token can't be trusted to only name orgs the user may act as). It
  returns the verified org id and the user's role. `withCurrentTenant(query)`
  feeds that id straight into `withTenant()`, so **RLS scopes every query with no
  explicit tenant filter** and app code never handles a raw tenant id.
- **Organization switching** (`switchOrganization` in `app/actions/org.ts`)
  re-verifies membership, then rewrites the JWT's `activeOrgId` via
  `unstable_update()`. On the next request the DAL feeds the new org into RLS —
  the tenant context follows the switch automatically.

Defense in depth: even if the DAL check were wrong, RLS still refuses rows for
any org whose id isn't in `app.current_tenant`. The membership re-check exists so
a *revoked* membership can't keep reading through a still-valid token.

### 5. Deriving the tenant on public (unauthenticated) routes

The public feedback boards (`/b/{orgSlug}/{boardSlug}`, in `app/b/…`) have **no
session**, so the active-org mechanism above doesn't apply. The tenant comes from
the **URL slug** instead. The two paths differ only in *how the org id is found*;
everything after that is identical.

| | Authenticated (`app/(app)/…`) | Public (`app/b/…`) |
| --- | --- | --- |
| Identity | Session JWT | None |
| Tenant source | `session.activeOrgId` (membership re-verified) | `orgSlug` in the path |
| Resolution helper | `requireActiveOrg()` | `resolvePublicOrg(orgSlug)` in `lib/public.ts` |
| Data access | `withCurrentTenant()` → `withTenant(orgId)` | `withPublicTenant(orgId)` → `withTenant(orgId)` |
| RLS | enforced | **enforced (identically)** |

`resolvePublicOrg` maps `orgSlug → { id, name }` using the **owner client**. This
is unavoidable and safe: RLS default-denies a connection with no tenant context,
so you can't read the org row to learn its id *before* you've set the tenant —
the same bootstrapping the authenticated side does when it resolves a session to
a user's memberships. Crucially this lookup returns only **routing identity**
(id + display name), never tenant data.

Once the id is known, **every** board/post/vote/comment query on a public route
runs through `withPublicTenant` (a thin wrapper over `withTenant`), so RLS
applies exactly as on the authenticated side. Consequences that fall out for
free:

- A public route **cannot read another org's rows** — passing org A's slug with
  a board id from org B returns nothing, because the query runs under org A's
  RLS context.
- **Only boards explicitly marked `isPublic` are reachable**; the board lookup
  filters on it and 404s otherwise, so private boards never surface publicly even
  though they live in the same tables.
- Anonymous **votes** dedupe on a signed (HMAC) `visitorId` cookie via a unique
  `(postId, visitorId)` constraint; anonymous **posts/comments** carry a null
  author. Votes and submissions are also **rate-limited** server-side
  (`lib/rate-limit.ts`), and public submissions count against the org's plan post
  limit like any other write.

The public write actions (`app/actions/public.ts`) re-resolve the tenant from the
slug on every call and never trust a client-supplied org id.

### 6. Parameterization

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

## Billing (Stripe)

Billing is **per-organization**: the Organization *is* the Stripe customer, not
the user. A person who belongs to several orgs has a separate subscription per
org, and only an **OWNER** of an org can change its billing.

Plans gate features:

| Plan | Boards | Posts per board |
| ---- | ------ | --------------- |
| FREE | 1      | 50              |
| PRO  | unlimited | unlimited    |

Amounts are **not** hardcoded in the app — the PRO price is created by
`scripts/stripe-setup.ts` and read back from Stripe (`getProPriceInfo`) for
display. Everything runs in Stripe **test mode**.

### Source of truth, and how state stays in sync

Stripe owns *payment* state; the `organizations` row is the app's **cached
projection** of it — `plan`, `subscriptionStatus`, `stripeCustomerId`,
`stripeSubscriptionId`. The app never flips a customer to PRO on its own: it
starts a Checkout session and then waits for Stripe to tell it what happened.

The projection is updated by the webhook at `app/api/webhooks/stripe`:

- **Signature is verified** against the raw request body with
  `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEvent`). An unsigned or
  tampered request is rejected with `400` before any handler runs.
- Events handled: `checkout.session.completed` (first activation),
  `customer.subscription.updated` (renewals, plan/status changes),
  `customer.subscription.deleted` (cancellation).
- The org is resolved from `organizationId` stamped into subscription metadata
  at checkout, falling back to a lookup by `stripeCustomerId`.
- Writes go through the **owner client** (`adminPrisma`) — the webhook is a
  trusted, cross-tenant system path with no user session, so it intentionally
  bypasses RLS (same rationale as seeding).

**Idempotency.** Each handler derives the org's *entire* desired state from the
subscription object and writes it in one update, rather than applying a delta.
Replaying an event, receiving duplicates (Stripe retries on non-2xx), or getting
two events for the same subscription therefore converges to the same row — no
double-charges-of-state, no drift. A handler error returns `500` so Stripe
retries later.

`planForSubscription` maps Stripe status → entitlement: `active`, `trialing`,
and `past_due` grant PRO (the last keeps access during the dunning grace
period); everything else (`canceled`, `unpaid`, `incomplete`, …) is FREE.

### Why enforcement is server-side

Plan limits are enforced in the **server action** that creates a board or post
(`app/actions/board.ts` → `assertCanCreateBoard` / `assertCanCreatePost` in
`lib/plans.ts`), never only in the UI. The frontend hides or disables things
for UX, but a Server Action is a public POST endpoint — anyone can call it
directly — so the authoritative check must live on the server, next to the
write. The limit checks run *inside* `withCurrentTenant`, so the board/post
counts they compare against are themselves RLS-scoped to the active org (a FREE
org can't be tricked into counting another tenant's boards). Hitting a limit
raises `PlanLimitError`, which the action turns into a friendly "upgrade to Pro"
message — it is never a 500, and never silently succeeds.

### What happens on downgrade

Downgrades (cancel, or a failed-then-abandoned payment) set `plan = FREE` but
**never delete data**. An org that created 3 boards on PRO and then downgrades
keeps all 3 boards and their posts — they remain fully readable and editable.
What changes is *creation*: the next `createBoard` is blocked because the org is
already at/over the FREE cap of 1, and posting to a board that already has ≥ 50
posts is blocked. The org gets everything back by upgrading again (or, for
boards, by deleting down under the cap). This "keep data, block growth" policy
avoids the data-loss and surprise of destructive downgrades.

---

## Tradeoffs & limitations

Honest downsides of this approach, and how they're mitigated here:

- **Blast radius of an RLS mistake.** Because all tenants share tables, a
  missing policy on a *new* tenant-owned table, or accidental use of the owner
  client to serve a request, leaks across tenants. Mitigations: default-deny
  policies, a documented owner-vs-app client split, a rule that every new
  tenant-owned table gets `ENABLE ROW LEVEL SECURITY` + a `tenant_isolation`
  policy in the same migration, and a CI test (`tests/rls.test.ts`) that asserts
  default-deny and cross-tenant denial against a real Postgres.
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

## Production & operations

The step-by-step deploy runbook lives in the [README](./README.md#deploy-to-production-vercel--neon).
This section explains the production *shape* — why the pieces are arranged the
way they are.

### Hosting

- **App:** Vercel (serverless functions per route). Stateless; all state is in
  Postgres and the signed session cookie.
- **Database:** Neon Postgres. Chosen specifically because its pooler runs
  **PgBouncer in transaction mode** — a hard requirement for how RLS is scoped
  here (below). Supabase Postgres works identically; the only thing that matters
  is a *transaction*-mode pooler.

### Connection pooling × RLS — the load-bearing interaction

Serverless functions each open their own DB connections, so a raw connection per
invocation exhausts Postgres. The fix is a pooler, and Neon's is PgBouncer. This
intersects with RLS in a way that is easy to get subtly, silently wrong:

The tenant is carried in `app.current_tenant`, set with `set_config(…, is_local
=> true)` — the function form of **`SET LOCAL`**, which is scoped to the current
transaction. `withTenant()` (`lib/tenant-db.ts`) sets it and runs the tenant's
queries **inside the same `$transaction`**. That is the only arrangement that is
correct under a transaction-mode pooler:

- **Transaction mode** assigns a backend connection to a client for the duration
  of one transaction, then returns it to the pool. Because the `set_config` and
  the queries share one transaction, they always land on the **same** backend,
  and the setting is discarded at `COMMIT`. Correct, and no leakage.
- Setting the variable **outside** a transaction (`$executeRaw` to set it, then a
  separate query) would let the pooler route the two statements to **different**
  backends. The query runs with no tenant set → default-deny → **rows silently
  dropped**; or it picks up a backend still carrying a **previous** request's
  value → **cross-tenant leak**. Both are silent — no error.
- Plain `SET` (session scope) on a **session-mode** pooler would leave the
  variable set on a shared backend after the request returns, leaking it into
  whichever tenant reuses that connection next.

So the rule is a package deal: **transaction-mode pooler + `SET LOCAL` + query,
all in one transaction.** Migrations are the exception — `prisma migrate deploy`
uses `DIRECT_URL` (the non-pooled host) because migrations need session-level
features (advisory locks) a transaction pooler can't provide.

`DATABASE_URL` (owner, pooled) and `APP_DATABASE_URL` (`saas_app`, pooled) are
the runtime connections; `DIRECT_URL` (owner, direct) is migrations-only. See
`prisma/schema.prisma` (`url` + `directUrl`) and `.env.example`.

### Migrations on deploy

The Vercel build runs `vercel-build`
(`prisma generate && prisma migrate deploy && next build`), so schema **and RLS
policies/grants** are applied with `migrate deploy` before the app serves
traffic — never `db push`, which has no migration history and could drift or
drop data. Each new tenant-owned table ships its `ENABLE ROW LEVEL SECURITY` +
`tenant_isolation` policy + `saas_app` GRANT in the same migration (see the
`posts`/`votes`/`comments` migrations), so a deploy can never expose a table
before its policy exists.

### CI gates

`.github/workflows/ci.yml` runs on every push and PR: **typecheck → lint →
tests**, and fails the build on any error. The test job spins up an ephemeral
`postgres:16` service, creates the `saas_app` role, runs `migrate deploy`, and
executes the suite — including `tests/rls.test.ts`, which asserts the isolation
invariants directly against Postgres (default-deny, no cross-tenant read, `WITH
CHECK` on writes) plus plan-limit and vote-dedupe enforcement. Deploy only from a
green commit; CI is the pre-deploy gate.

### Secrets management

No secrets live in the repo. `.env` is gitignored and `.env.example` holds only
placeholders. In production, every secret (`AUTH_SECRET`, the three DB URLs,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) is set in Vercel's encrypted
environment-variable store, scoped per environment so Preview deploys never see
production credentials. CI uses throwaway values for a disposable database. The
runtime app role (`saas_app`) is deliberately un-privileged (`NOSUPERUSER`,
`NOBYPASSRLS`, non-owner), so even a leak of `APP_DATABASE_URL` is still bounded
by RLS.

---

## What's deliberately not here yet

- **User sign-up / invitations.** Accounts and memberships come from the seed;
  there is no self-service registration or org-invite flow yet.
- **Webhook event dedupe table.** Handlers are idempotent by construction; a
  persisted `processed_stripe_events` ledger would additionally short-circuit
  replays and guard against out-of-order deliveries as the event set grows.
