#!/usr/bin/env bash
#
# Bootstrap a LOCAL (non-Docker) Postgres for development.
#
# docker-compose creates the `saas_owner`/`saas_dev`/`saas_app` roles and
# database automatically. When you instead run Postgres natively (e.g. via
# Homebrew), run this once to create the same roles and database. It is
# idempotent — safe to re-run.
#
# Prereqs: a running Postgres you can reach as a superuser. By default this
# connects to the `postgres` maintenance database as the current OS user, which
# is how Homebrew's `postgresql@16` is set up.
#
# Usage:
#   ./scripts/bootstrap-local.sh
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./scripts/bootstrap-local.sh
set -euo pipefail

# Prefer Homebrew's postgresql@16 psql if it is not already on PATH.
if ! command -v psql >/dev/null 2>&1; then
  if [ -x /opt/homebrew/opt/postgresql@16/bin/psql ]; then
    export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
  fi
fi

# Maintenance connection (superuser). Overridable via standard PG* env vars.
MAINT_DB="${PGDATABASE:-postgres}"

run_maint() { psql -v ON_ERROR_STOP=1 -d "$MAINT_DB" -tAc "$1"; }

echo "==> Creating roles (idempotent)"
# saas_owner: owns the schema; used by migrations + seed; bypasses RLS as owner.
# CREATEDB lets Prisma Migrate spin up its shadow database.
run_maint "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_owner') THEN
    CREATE ROLE saas_owner LOGIN CREATEDB PASSWORD 'owner_pw';
  END IF;
END \$\$;"

# saas_app: runtime role; RLS is fully enforced (no superuser, no BYPASSRLS).
run_maint "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
    CREATE ROLE saas_app LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;"

echo "==> Creating database saas_dev (idempotent)"
if [ "$(run_maint "SELECT 1 FROM pg_database WHERE datname = 'saas_dev'")" != "1" ]; then
  run_maint "CREATE DATABASE saas_dev OWNER saas_owner"
else
  echo "    saas_dev already exists"
fi

echo "==> Granting connect/usage to saas_app"
psql -v ON_ERROR_STOP=1 -d saas_dev -tAc "GRANT CONNECT ON DATABASE saas_dev TO saas_app;"
psql -v ON_ERROR_STOP=1 -d saas_dev -tAc "GRANT USAGE ON SCHEMA public TO saas_app;"

echo "==> Done. Roles: saas_owner (owner), saas_app (runtime). Database: saas_dev."
