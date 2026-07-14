# SAAS Shenanigans

Foundation for a multi-tenant B2B SaaS: **Next.js (App Router, TypeScript
strict) + Tailwind + Postgres + Prisma**, with tenant isolation enforced by
**Postgres Row-Level Security (RLS)**.

Authentication (Auth.js / NextAuth v5, email + password) and **organization
switching** are wired in: the signed-in user's active organization is pushed
into the Postgres RLS session variable on every request, so tenant isolation is
enforced automatically — no query ever writes an explicit `organization_id`
filter. No billing yet.

After signing in, the `/` dashboard renders the active organization's boards and
members, read entirely through the RLS-enforced runtime connection. Users who
belong to more than one org get a switcher that changes the active tenant.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the multi-tenancy design and
its tradeoffs.

## Stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript     |
| Styling   | Tailwind CSS v4                                    |
| Database  | PostgreSQL 16                                      |
| ORM       | Prisma 6                                           |
| Tenancy   | Shared DB + shared schema, isolated via RLS       |

## Data model

- **Organization** — the tenant.
- **User** — a global identity; can belong to many organizations.
- **Membership** — join table between `User` and `Organization`, carrying a
  `Role` (`OWNER` / `MEMBER`).
- **Board** — a tenant-owned domain object belonging to an `Organization`.

Tenant-owned tables (`organizations`, `memberships`, `boards`) are protected by
RLS. `users` is global and intentionally not tenant-scoped.

## Two database roles

Isolation depends on connecting as the right role:

| Role         | Connection string  | RLS      | Used by                             |
| ------------ | ------------------ | -------- | ----------------------------------- |
| `saas_owner` | `DATABASE_URL`     | bypassed | Prisma Migrate, seed, admin/system  |
| `saas_app`   | `APP_DATABASE_URL` | enforced | The running app, via `withTenant()` |

`saas_owner` owns the tables, so it bypasses RLS (that's what makes migrations
and cross-tenant seeding possible). `saas_app` is a plain role with no
owner/superuser/BYPASSRLS privileges, so every query it runs is filtered by the
RLS policies. Details in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Run it

Prerequisites: Node 20+, npm, and **either** Docker **or** a local Postgres 16.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults point at `localhost:5432` and match both the Docker and local-
Postgres setups below. (Dev-only credentials — do not reuse in production.)

### 3. Start Postgres

**Option A — Docker (recommended, matches the spec):**

```bash
docker compose up -d
```

This starts Postgres, creates the `saas_owner` role + `saas_dev` database, and
runs `docker/init/01-create-app-role.sql` to create the `saas_app` runtime role.

**Option B — local Postgres (e.g. Homebrew):**

```bash
brew services start postgresql@16   # or however you run Postgres
./scripts/bootstrap-local.sh        # creates saas_owner, saas_app, saas_dev
```

`scripts/bootstrap-local.sh` is idempotent and does what the Docker init does.

### 4. Apply migrations (schema + RLS policies)

```bash
npm run db:migrate
```

### 5. Seed data (2 orgs, 4 users, memberships, boards)

```bash
npm run db:seed
```

### 6. Start the app

```bash
npm run dev
```

Open **http://localhost:3000**. You'll be redirected to `/login` — sign in with
any seeded account (all seed passwords are `password123`):

| Email                  | Belongs to        |
| ---------------------- | ----------------- |
| `alice@acme.test`      | Acme (owner)      |
| `bob@acme.test`        | Acme (member)     |
| `carol@globex.test`    | Globex (owner)    |
| `dave@contractor.test` | Acme **and** Globex — sign in as Dave to try the org switcher |

---

## Billing (Stripe test mode)

Subscription billing gates features per **organization** (the org is the Stripe
customer): FREE = 1 board / 50 posts per board; PRO = unlimited. See
[ARCHITECTURE.md](./ARCHITECTURE.md#billing-stripe) for the sync + enforcement
design.

### Setup (all test mode)

1. Paste your Stripe **test** secret key into `.env` as `STRIPE_SECRET_KEY`
   (`sk_test_…`, from <https://dashboard.stripe.com/test/apikeys>).
2. Create the products/prices and copy the printed PRO price id into `.env`:

   ```bash
   npm run stripe:setup           # prints STRIPE_PRICE_PRO="price_…"
   ```

3. Forward webhooks to the app and paste the printed `whsec_…` into `.env` as
   `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Restart `npm run dev`. Open **/billing** as an org **owner** (e.g. Alice),
   click **Upgrade to Pro**, and pay with test card `4242 4242 4242 4242`
   (any future expiry / CVC). The webhook flips the org to PRO.

Enforcement is server-side: on FREE, creating a 2nd board or a 51st post in a
board is rejected with an "upgrade to Pro" message regardless of the UI.

---

## Deploy to production (Vercel + Neon)

Hosting is **Vercel** (Next.js) + **[Neon](https://neon.tech) Postgres** (chosen
because its pooler runs PgBouncer in **transaction mode**, which our RLS design
requires — see [ARCHITECTURE.md → Production & operations](./ARCHITECTURE.md#production--operations)).
Both have free tiers sufficient for this app. Follow the steps in order.

### 1. Create the Neon database and the two roles

1. Create a Neon project. Neon gives you a default owner role and database.
2. In Neon's **SQL Editor**, create the non-owner runtime role that RLS is
   enforced against (Neon roles can't be created with `NOBYPASSRLS` via the UI,
   so use SQL — a plain non-owner role does not bypass RLS anyway):

   ```sql
   CREATE ROLE saas_app LOGIN PASSWORD 'a-strong-random-password'
     NOSUPERUSER NOBYPASSRLS;
   GRANT CONNECT ON DATABASE neondb TO saas_app;
   -- Table-level GRANTs to saas_app are created by the RLS migrations, so run
   -- this role creation BEFORE step 4 (migrations). No table GRANTs needed here.
   ```

3. From the Neon dashboard **Connection Details**, copy two host strings:
   - the **Pooled** connection (host contains `-pooler`) — for runtime.
   - the **Direct** connection (host without `-pooler`) — for migrations.

   You'll build three URLs from these (owner user + password come from Neon;
   `saas_app` password is the one you set above):

   | Env var            | Role       | Host   | Notes                                  |
   | ------------------ | ---------- | ------ | -------------------------------------- |
   | `DATABASE_URL`     | owner      | pooled | runtime admin/system + Prisma default  |
   | `DIRECT_URL`       | owner      | direct | `prisma migrate deploy` only           |
   | `APP_DATABASE_URL` | `saas_app` | pooled | RLS-enforced runtime queries           |

   Append `?sslmode=require` to all three, and `&pgbouncer=true` to the two
   **pooled** URLs. See `.env.example` for exact formatting.

### 2. Push to GitHub (CI runs automatically)

Push the repo to GitHub. `.github/workflows/ci.yml` runs typecheck, lint, and the
test suite against an ephemeral Postgres on every push/PR. **Only deploy from a
green commit** — CI is your pre-deploy gate.

### 3. Import the project into Vercel and set env vars

1. In Vercel, **Add New → Project** and import the GitHub repo. It auto-detects
   Next.js.
2. Under **Settings → Environment Variables**, add (for the **Production**
   environment — see the Preview caveat below):

   - `DATABASE_URL`, `DIRECT_URL`, `APP_DATABASE_URL` — from step 1.
   - `AUTH_SECRET` — generate with `openssl rand -base64 32` (a fresh value, not
     your dev one).
   - `APP_URL` — your deployed origin, e.g. `https://your-app.vercel.app` (no
     trailing slash). You can set a placeholder now and fix it after the first
     deploy assigns a URL.
   - `STRIPE_SECRET_KEY` — your **live** key (`sk_live_…`).
   - `STRIPE_PRICE_PRO` — see step 5.
   - `STRIPE_WEBHOOK_SECRET` — see step 5.

3. **Migrations on deploy:** the `vercel-build` script
   (`prisma generate && prisma migrate deploy && next build`) runs on every
   Vercel build, so migrations are applied with `prisma migrate deploy` (never
   `db push`) before the app boots. Vercel picks up `vercel-build`
   automatically; if you overrode the Build Command, set it to
   `npm run vercel-build`.

   > **Preview-deploy caveat:** because the build runs `migrate deploy`, any
   > environment that has the DB vars set will migrate that DB. Give the real
   > `DATABASE_URL`/`DIRECT_URL` to **Production only**. For Preview deploys,
   > either leave the DB vars unset or point them at a separate Neon branch
   > database, so a feature branch never migrates production.

Trigger the first deploy (push, or **Deploy** in Vercel). The build applies
migrations, including the RLS policies and the `saas_app` GRANTs.

### 4. Register the Stripe webhook and finish Stripe setup

Production uses a **real webhook endpoint** instead of `stripe listen`:

1. Create the PRO product/price in **live** mode. Locally, with your live key in
   `STRIPE_SECRET_KEY`, run `npm run stripe:setup` and copy the printed
   `price_…` into Vercel's `STRIPE_PRICE_PRO`. (Or create it by hand in the
   Stripe dashboard.)
2. In the Stripe dashboard (**Developers → Webhooks → Add endpoint**), set the
   endpoint URL to:

   ```
   https://your-app.vercel.app/api/webhooks/stripe
   ```

   Subscribe to the `checkout.session.completed`, `customer.subscription.updated`,
   and `customer.subscription.deleted` events.
3. Copy the endpoint's **Signing secret** (`whsec_…`) into Vercel's
   `STRIPE_WEBHOOK_SECRET`, then **redeploy** so the new value is picked up. The
   webhook route verifies every request against this secret.

### 5. Create your first real organization (no fake seed data)

Do **not** run `npm run db:seed` in production — it inserts demo orgs. Instead,
run the idempotent first-run script once, locally, pointed at the production
database:

```bash
DATABASE_URL='postgresql://<owner>:***@<direct-host>/neondb?sslmode=require' \
ADMIN_EMAIL='you@example.com' \
ADMIN_PASSWORD='a-strong-password' \
ADMIN_ORG_NAME='Your Company' \
npm run create-admin
```

It creates (or reuses) one organization and an `OWNER` login without overwriting
existing credentials. Then sign in at `https://your-app.vercel.app/login`.

### Deploy checklist (TL;DR)

- [ ] Neon project created; `saas_app` role created via SQL (step 1.2)
- [ ] `DATABASE_URL` (owner/pooled), `DIRECT_URL` (owner/direct),
      `APP_DATABASE_URL` (saas_app/pooled) built with `sslmode=require`
- [ ] Repo on GitHub; **CI green**
- [ ] Vercel project imported; all env vars set for **Production**
- [ ] First deploy succeeded → `migrate deploy` applied schema + RLS
- [ ] `STRIPE_PRICE_PRO` from live-mode `stripe:setup`
- [ ] Stripe webhook endpoint registered → `STRIPE_WEBHOOK_SECRET` set →
      redeployed
- [ ] `npm run create-admin` run against prod DB; can sign in
- [ ] Upgrade flow tested with a real card (or Stripe test clock)

---

## Handy scripts

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Start the Next.js dev server                  |
| `npm run build`          | Production build                              |
| `npm run typecheck`      | `tsc --noEmit` (strict, no `any`)             |
| `npm run lint`           | ESLint                                        |
| `npm run db:migrate`     | Apply migrations (`prisma migrate deploy`)    |
| `npm run db:migrate:dev` | Create + apply a new migration in development |
| `npm run db:seed`        | Run the seed script                           |
| `npm run db:reset`       | Drop, re-migrate, and re-seed (destructive)   |
| `npm run db:studio`      | Open Prisma Studio                            |
| `npm run stripe:setup`   | Create FREE/PRO products + PRO price          |
| `npm run create-admin`   | First-run: create one real org + owner login  |
| `npm test`               | Run the test suite (Vitest; needs Postgres)   |

## Project layout

```
auth.ts               NextAuth instance + Credentials provider (bcrypt)
auth.config.ts        DB-free auth config (route protection, JWT/session callbacks)
proxy.ts              Next.js 16 "proxy" (ex-middleware): optimistic route protection
app/
  layout.tsx          Root layout
  global-error.tsx    Root error boundary
  page.tsx            "/" — dashboard: active org's boards + members, org switcher
  login/              Sign-in page + client form
  actions/            Server actions: authenticate/logout, switchOrganization
  ui/org-switcher.tsx Client org switcher
  api/auth/[...nextauth]/route.ts   Auth.js route handlers
lib/
  prisma.ts           adminPrisma  — owner role, BYPASSES RLS (system/admin only)
  tenant-db.ts        appPrisma + withTenant() — runtime role, RLS enforced
  dal.ts              Data Access Layer: session → active org → withCurrentTenant()
types/
  next-auth.d.ts      Session/JWT augmentation (user id, activeOrgId)
prisma/
  schema.prisma       Data model
  seed.ts             Seed script (2 orgs, users w/ passwords, memberships, boards)
  migrations/
    *_init/                    Tables
    *_rls_tenant_isolation/    Enable RLS, policies, and saas_app grants
    *_add_password_hash/       users.password_hash for the Credentials provider
    *_posts_votes_comments/    Posts/votes/comments (+ their RLS policies + grants)
    *_public_boards_and_slugs/ Public boards, slugs, anonymous votes/comments
docker/
  init/               Postgres first-boot SQL (creates saas_app role)
scripts/
  bootstrap-local.sh  Non-Docker equivalent of the Docker init
  create-admin.ts     Idempotent production first-run: one real org + owner
  stripe-setup.ts     Create Stripe FREE/PRO products + PRO price
tests/
  rls.test.ts         RLS isolation, plan limits, vote dedupe (needs Postgres)
  slug.test.ts        Pure slug helpers
  setup-env.ts        Loads .env for local runs (CI injects its own vars)
.github/workflows/
  ci.yml              Typecheck + lint + tests on ephemeral Postgres, per push/PR
docker-compose.yml    Postgres service
```

## How tenant-scoped queries work

In request handling, reach for the session-aware wrapper — it resolves the
signed-in user's active organization and pushes it into RLS for you:

```ts
import { withCurrentTenant } from "@/lib/dal";

// Derives the active org from the session, verifies membership, and scopes every
// query via RLS. No `where: { organizationId }` needed.
const boards = await withCurrentTenant((tx) => tx.board.findMany());
```

Under the hood this calls `withTenant(activeOrgId, …)`, which sets
`app.current_tenant` for the duration of one transaction. You can still call
`withTenant()` directly for trusted paths that already know the tenant id
(e.g. seeding-adjacent tooling).

Outside any tenant context, the `saas_app` role sees **no** tenant-owned rows
(RLS default-deny). Cross-tenant reads return zero rows and cross-tenant writes
are rejected by the policies' `WITH CHECK` clause.
