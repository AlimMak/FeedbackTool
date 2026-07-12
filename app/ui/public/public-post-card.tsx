import Link from "next/link";
import type { PostStatus } from "@prisma/client";

import { CommentIcon } from "../icons";
import { StatusPill } from "../status-pill";
import { PublicVoteButton } from "./public-vote-button";

export type PublicPostData = {
  id: string;
  title: string;
  description: string | null;
  status: PostStatus;
  authorLabel: string;
  votes: number;
  comments: number;
  hasVoted: boolean;
};

export function PublicPostCard({
  post,
  orgSlug,
  boardSlug,
}: {
  post: PublicPostData;
  orgSlug: string;
  boardSlug: string;
}) {
  return (
    <div className="flex gap-3 rounded-card border-[0.5px] border-border bg-surface p-4">
      <PublicVoteButton
        orgSlug={orgSlug}
        boardSlug={boardSlug}
        postId={post.id}
        initialCount={post.votes}
        initialVoted={post.hasVoted}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium">
            <Link
              href={`/b/${orgSlug}/${boardSlug}/${post.id}`}
              className="hover:text-accent"
            >
              {post.title}
            </Link>
          </h3>
          <StatusPill status={post.status} />
        </div>
        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {post.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <Link
            href={`/b/${orgSlug}/${boardSlug}/${post.id}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <CommentIcon className="h-3.5 w-3.5" />
            {post.comments}
            <span className="sr-only">comments</span>
          </Link>
          <span>{post.authorLabel}</span>
        </div>
      </div>
    </div>
  );
}
