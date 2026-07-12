import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PublicBoardView } from "@/app/ui/public/public-board-view";
import { PublicHeader } from "@/app/ui/public/public-header";
import type { PublicPostData } from "@/app/ui/public/public-post-card";
import { PLAN_LIMITS } from "@/lib/plans";
import { resolvePublicOrg, withPublicTenant } from "@/lib/public";
import { readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

// A visitor id that can never collide with a real UUID — used so "have I voted"
// resolves to false (not to null-visitor rows) when there's no cookie yet.
const NO_VISITOR = "no-visitor";

type Params = { orgSlug: string; boardSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { orgSlug, boardSlug } = await params;
  const org = await resolvePublicOrg(orgSlug);
  if (!org) return { title: "Not found" };
  const board = await withPublicTenant(org.id, (tx) =>
    tx.board.findFirst({
      where: { slug: boardSlug, isPublic: true },
      select: { name: true },
    }),
  );
  if (!board) return { title: "Not found" };
  return { title: `${board.name} — ${org.name}` };
}

export default async function PublicBoardPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { orgSlug, boardSlug } = await params;

  // 1. Resolve the tenant from the URL slug (routing lookup).
  const org = await resolvePublicOrg(orgSlug);
  if (!org) notFound();

  const visitorId = (await readVisitorId()) ?? NO_VISITOR;

  // 2. Everything below runs under RLS for that org.
  const data = await withPublicTenant(org.id, async (tx) => {
    const board = await tx.board.findFirst({
      where: { slug: boardSlug, isPublic: true },
      select: { id: true, name: true },
    });
    if (!board) return null;

    const orgRow = await tx.organization.findFirstOrThrow({
      select: { plan: true },
    });
    const posts = await tx.post.findMany({
      where: { boardId: board.id },
      orderBy: [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        author: { select: { name: true } },
        _count: { select: { votes: true, comments: true } },
        votes: { where: { visitorId }, select: { id: true } },
      },
    });
    return { board, plan: orgRow.plan, posts };
  });

  if (!data) notFound();

  const posts: PublicPostData[] = data.posts.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    authorLabel: p.author?.name ?? "Anonymous",
    votes: p._count.votes,
    comments: p._count.comments,
    hasVoted: p.votes.length > 0,
  }));

  const postLimit = PLAN_LIMITS.FREE.maxPostsPerBoard;
  const submissionsClosed =
    data.plan === "FREE" && postLimit !== null && posts.length >= postLimit;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <PublicHeader orgName={org.name} />
      <h1 className="mt-5 text-xl font-medium">{data.board.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Vote on ideas or suggest your own.
      </p>
      <div className="mt-6">
        <PublicBoardView
          orgSlug={orgSlug}
          boardSlug={boardSlug}
          posts={posts}
          submissionsClosed={submissionsClosed}
        />
      </div>
    </main>
  );
}
