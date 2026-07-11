# SAAS Shenanigans

Foundation for a multi-tenant B2B SaaS: **Next.js (App Router, TypeScript
strict) + Tailwind + Postgres + Prisma**, with tenant isolation enforced by
**Postgres Row-Level Security (RLS)**.

This repo is the project scaffold + data model only. No auth or billing yet.
The `/` page proves the stack works end to end by rendering each organization
with its boards and members — read entirely through the RLS-enforced runtime
connection.

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

Open **http://localhost:3000** — you'll see both organizations with their
boards and members, plus a banner confirming RLS isolation between tenants.

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

## Project layout

```
app/
  layout.tsx          Root layout
  page.tsx            "/" — org + board demo, reads via withTenant() under RLS
lib/
  prisma.ts           adminPrisma  — owner role, BYPASSES RLS (system/admin only)
  tenant-db.ts        appPrisma + withTenant() — runtime role, RLS enforced
prisma/
  schema.prisma       Data model
  seed.ts             Seed script (2 orgs, users, memberships, boards)
  migrations/
    *_init/                    Tables
    *_rls_tenant_isolation/    Enable RLS, policies, and saas_app grants
docker/
  init/               Postgres first-boot SQL (creates saas_app role)
scripts/
  bootstrap-local.sh  Non-Docker equivalent of the Docker init
docker-compose.yml    Postgres service
```

## How tenant-scoped queries work

```ts
import { withTenant } from "@/lib/tenant-db";

// Sets `app.current_tenant` for the duration of one transaction; RLS scopes
// every query to this org. Note: no `where: { organizationId }` needed.
const boards = await withTenant(orgId, (tx) => tx.board.findMany());
```

Outside `withTenant()`, the `saas_app` role sees **no** tenant-owned rows
(RLS default-deny). Cross-tenant reads return zero rows and cross-tenant writes
are rejected by the policies' `WITH CHECK` clause.
