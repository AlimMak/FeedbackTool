-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "content",
ADD COLUMN     "author_id" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "votes_post_id_idx" ON "votes"("post_id");

-- CreateIndex
CREATE INDEX "votes_organization_id_idx" ON "votes"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_post_id_user_id_key" ON "votes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "comments_post_id_idx" ON "comments"("post_id");

-- CreateIndex
CREATE INDEX "comments_organization_id_idx" ON "comments"("organization_id");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Row-Level Security for the new tenant-owned tables `votes` and `comments`.
-- Same invariant as every tenant table: a row is visible/writable only when its
-- organization_id matches the per-request `app.current_tenant` set by
-- withTenant(); default-deny when unset. `posts` already has its policy from an
-- earlier migration and keeps it across the column changes above.
-- ============================================================================
ALTER TABLE "votes"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "votes"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation ON "comments"
  USING (organization_id = current_setting('app.current_tenant', true))
  WITH CHECK (organization_id = current_setting('app.current_tenant', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "votes"    TO saas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "comments" TO saas_app;
