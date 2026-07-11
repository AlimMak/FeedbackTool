-- Row-Level Security: tenant isolation
-- ============================================================================
-- This migration turns the shared-schema tables into tenant-isolated tables
-- using Postgres RLS. The current tenant is carried in the `app.current_tenant`
-- session variable, set per-request by withTenant() in lib/tenant-db.ts.
--
-- Enforcement model:
--   * RLS is ENABLED (not FORCED), so the table owner (saas_owner) — used by
--     migrations and the seed script — bypasses these policies. That is
--     intentional: seeding and system/admin work is cross-tenant.
--   * The runtime role `saas_app` is neither a superuser, nor a table owner,
--     nor granted BYPASSRLS, so every query it runs is filtered by the
--     policies below.
--
-- current_setting('app.current_tenant', true): the second arg (missing_ok)
-- returns NULL when the variable is unset, so a connection with no tenant
-- context sees NO tenant-owned rows (default deny) instead of erroring.
-- ============================================================================

-- Tenant-owned tables. `users` is intentionally excluded — it is a global
-- identity table (a person can belong to many organizations).
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boards"        ENABLE ROW LEVEL SECURITY;

-- The Organization row IS the tenant, so it is scoped by its own id.
CREATE POLICY tenant_isolation ON "organizations"
  USING (id = current_setting('app.current_tenant', true))
  WITH CHECK (id = current_setting('app.current_tenant', true));

-- Every other tenant-owned table is scoped by its organization_id.
CREATE POLICY tenant_isolation ON "memberships"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON "boards"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));

-- ----------------------------------------------------------------------------
-- Runtime-role privileges.
--
-- RLS decides which ROWS are visible; GRANTs decide which TABLES the role may
-- touch at all. Without these, saas_app would get "permission denied" before
-- RLS is ever consulted. Table owners (saas_owner) may GRANT on their tables.
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO saas_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO saas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships"   TO saas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "boards"        TO saas_app;

-- Global identity table: readable by the app for membership/user joins, but
-- not tenant-scoped. Writes to users go through the owner/system path.
GRANT SELECT ON "users" TO saas_app;
