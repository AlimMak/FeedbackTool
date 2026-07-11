-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT,
ADD COLUMN     "subscription_status" TEXT;

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_board_id_idx" ON "posts"("board_id");

-- CreateIndex
CREATE INDEX "posts_organization_id_idx" ON "posts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_customer_id_key" ON "organizations"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripe_subscription_id_key" ON "organizations"("stripe_subscription_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Row-Level Security for the new tenant-owned table `posts`.
--
-- Same invariant as boards/memberships/organizations: rows are visible/writable
-- only when their organization_id matches the per-request `app.current_tenant`
-- session variable set by withTenant(). Default-deny when unset. See
-- ARCHITECTURE.md and the *_rls_tenant_isolation migration.
--
-- NOTE: the billing columns added to `organizations` need no new policy — that
-- table already has a tenant_isolation policy on its id, and saas_app's existing
-- table-level GRANTs cover the new columns. Billing writes go through the owner
-- role (webhook), which bypasses RLS by design.
-- ============================================================================
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "posts"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "posts" TO saas_app;
