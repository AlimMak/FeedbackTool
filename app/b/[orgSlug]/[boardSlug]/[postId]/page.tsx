import { notFound } from "next/navigation";

import { publicAddComment } from "@/app/actions/public";
import { CommentsSection } from "@/app/ui/comments-section";
import { PublicHeader } from "@/app/ui/public/public-header";
import { PublicVoteButton } from "@/app/ui/public/public-vote-button";
import { StatusPill } from "@/app/ui/status-pill";
import { buildCommentTree } from "@/lib/comments";
import { resolvePublicOrg, withPublicTenant } from "@/lib/public";
import { readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const NO_VISITOR = "no-visitor";

type Params = { orgSlug: string; boardSlug: string; postId: string };

export default async function PublicPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { orgSlug, boardSlug, postId } = await params;

  const org = await resolvePublicOrg(orgSlug);
  if (!org) notFound();

  const visitorId = (await readVisitorId()) ?? NO_VISITOR;

  const data = await withPublicTenant(org.id, async (tx) => {
    const post = await tx.post.findFirst({
      where: { id: postId, board: { slug: boardSlug, isPublic: true } },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        author: { select: { name: true } },
        _count: { select: { votes: true } },
        votes: { where: { visitorId }, select: { id: true } },
      },
    });
    if (!post) return null;

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
  const addComment = publicAddComment.bind(null, orgSlug, boardSlug, postId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <PublicHeader orgName={org.name} backHref={`/b/${orgSlug}/${boardSlug}`} />

      <article className="mt-6 flex gap-3">
        <PublicVoteButton
          orgSlug={orgSlug}
          boardSlug={boardSlug}
          postId={post.id}
          initialCount={post._count.votes}
          initialVoted={post.votes.length > 0}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-medium">{post.title}</h1>
            <StatusPill status={post.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {post.author?.name ?? "Anonymous"}
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
          addAction={addComment}
          withName
          canDelete={false}
        />
      </div>
    </main>
  );
}
