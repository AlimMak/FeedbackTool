-- Runs once, as the superuser `saas_owner`, when the Postgres data volume is
-- first initialized (Docker entrypoint). Creates the RLS-enforced runtime role.
--
-- `saas_app` is deliberately:
--   * NOSUPERUSER  — superusers bypass RLS.
--   * NOBYPASSRLS  — this attribute would also bypass RLS.
--   * not the owner of any table — table owners bypass RLS unless FORCE is set.
-- Together these guarantee every query `saas_app` runs is filtered by the RLS
-- policies defined in the Prisma RLS migration.
--
-- Table-level GRANTs (SELECT/INSERT/UPDATE/DELETE) are issued by the RLS
-- migration, since the tables do not exist yet at init time.

DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE saas_dev TO saas_app;
GRANT USAGE ON SCHEMA public TO saas_app;
