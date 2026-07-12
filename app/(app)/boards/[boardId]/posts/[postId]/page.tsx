import Link from "next/link";
import { notFound } from "next/navigation";

import { addComment } from "@/app/actions/comment";
import { CommentsSection } from "@/app/ui/comments-section";
import { StatusControl } from "@/app/ui/status-control";
import { VoteButton } from "@/app/ui/vote-button";
import { buildCommentTree } from "@/lib/comments";
import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function AdminPostPage({
  params,
}: {
  params: Promise<{ boardId: string; postId: string }>;
}) {
  const { boardId, postId } = await params;
  const { activeOrgId, role, userId } = await requireActiveOrg();
  if (!activeOrgId) notFound();

  const data = await withCurrentTenant(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        boardId: true,
        submitterEmail: true,
        author: { select: { name: true } },
        _count: { select: { votes: true } },
        votes: { where: { userId }, select: { id: true } },
      },
    });
    if (!post || post.boardId !== boardId) return null;

    const comments = await tx.comment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        parentId: true,
        createdAt: true,
        authorName: true,
        author: { select: { name: true } },
      },
    });
    return { post, comments };
  });

  if (!data) notFound();

  const { post } = data;
  const comments = buildCommentTree(data.comments);
  const add = addComment.bind(null, postId);
  const isOwner = role === "OWNER";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href={`/boards/${boardId}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Back to board
      </Link>

      <article className="mt-4 flex gap-3">
        <VoteButton
          postId={post.id}
          initialCount={post._count.votes}
          initialVoted={post.votes.length > 0}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-medium">{post.title}</h1>
            <StatusControl
              postId={post.id}
              status={post.status}
              canChange={isOwner}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {post.author?.name ?? "Anonymous"}
            {post.submitterEmail ? ` · ${post.submitterEmail}` : ""}
          </p>
          {post.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm">
              {post.description}
            </p>
          )}
        </div>
      </article>

      <div className="mt-8 border-t-[0.5px] border-border pt-6">
        <CommentsSection
          comments={comments}
          addAction={add}
          withName={false}
          canDelete={isOwner}
        />
      </div>
    </div>
  );
}
