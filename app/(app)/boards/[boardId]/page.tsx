import { notFound } from "next/navigation";

import { BoardBody, type BoardUsage } from "@/app/ui/board-body";
import type { PostCardData } from "@/app/ui/post-card";
import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const { activeOrgId, role, userId } = await requireActiveOrg();
  if (!activeOrgId) notFound();

  // All reads are RLS-scoped to the active org — no explicit organization
  // filter. `votes: { where: { userId } }` resolves the current user's own vote.
  const data = await withCurrentTenant(async (tx) => {
    const board = await tx.board.findUnique({
      where: { id: boardId },
      select: { id: true, name: true },
    });
    if (!board) return null;

    const org = await tx.organization.findFirstOrThrow({
      select: { plan: true },
    });
    const posts = await tx.post.findMany({
      where: { boardId },
      orderBy: [{ votes: { _count: "desc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        author: { select: { name: true } },
        _count: { select: { votes: true, comments: true } },
        votes: { where: { userId }, select: { id: true } },
      },
    });
    return { board, plan: org.plan, posts };
  });

  if (!data) notFound();

  const posts: PostCardData[] = data.posts.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    authorName: p.author.name,
    votes: p._count.votes,
    comments: p._count.comments,
    hasVoted: p.votes.length > 0,
  }));

  // Usage line is shown for FREE only (PRO is unlimited).
  const postLimit = PLAN_LIMITS.FREE.maxPostsPerBoard;
  const usage: BoardUsage =
    data.plan === "FREE" && postLimit !== null
      ? { used: posts.length, limit: postLimit }
      : null;

  return (
    <BoardBody
      boardId={data.board.id}
      boardName={data.board.name}
      usage={usage}
      posts={posts}
      canChangeStatus={role === "OWNER"}
    />
  );
}
