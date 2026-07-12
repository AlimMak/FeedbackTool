-- Public boards: board slugs + visibility, anonymous votes and comments,
-- nullable post/comment authors.
--
-- No new RLS setup here: `boards`, `votes` and `comments` already have their
-- tenant_isolation policies, and the columns added below are covered by the
-- existing table-level grants to `saas_app`. Public routes reach this data by
-- resolving the org from the URL slug (owner-role routing lookup) and then
-- running every query through withTenant() under RLS — see ARCHITECTURE.md.

-- DropForeignKey (author becomes nullable + SET NULL on delete)
ALTER TABLE "comments" DROP CONSTRAINT "comments_author_id_fkey";
ALTER TABLE "posts" DROP CONSTRAINT "posts_author_id_fkey";

-- Boards: visibility + slug. Add slug nullable, backfill from the name, then
-- make it NOT NULL and unique per organization.
ALTER TABLE "boards" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "boards" ADD COLUMN "slug" TEXT;
UPDATE "boards"
  SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')));
UPDATE "boards" SET "slug" = "id" WHERE "slug" IS NULL OR "slug" = '';
ALTER TABLE "boards" ALTER COLUMN "slug" SET NOT NULL;

-- Comments: anonymous author + display name + one-level threading.
ALTER TABLE "comments"
  ADD COLUMN "author_name" TEXT,
  ADD COLUMN "parent_id" TEXT,
  ALTER COLUMN "author_id" DROP NOT NULL;

-- Posts: anonymous submissions (nullable author + optional contact email).
ALTER TABLE "posts"
  ADD COLUMN "submitter_email" TEXT,
  ALTER COLUMN "author_id" DROP NOT NULL;

-- Votes: anonymous visitor votes.
ALTER TABLE "votes"
  ADD COLUMN "visitor_id" TEXT,
  ALTER COLUMN "user_id" DROP NOT NULL;

-- Indexes / constraints
CREATE UNIQUE INDEX "boards_organization_id_slug_key" ON "boards"("organization_id", "slug");
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");
CREATE UNIQUE INDEX "votes_post_id_visitor_id_key" ON "votes"("post_id", "visitor_id");

-- Foreign keys
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
