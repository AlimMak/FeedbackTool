"use client";

import type { PostStatus } from "@prisma/client";

import { CommentIcon } from "./icons";
import { StatusControl } from "./status-control";
import { VoteButton } from "./vote-button";

export type PostCardData = {
  id: string;
  title: string;
  description: string | null;
  status: PostStatus;
  authorName: string;
  votes: number;
  comments: number;
  hasVoted: boolean;
};

export function PostCard({
  post,
  canChangeStatus,
}: {
  post: PostCardData;
  canChangeStatus: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-card border-[0.5px] border-border bg-surface p-4">
      <VoteButton
        postId={post.id}
        initialCount={post.votes}
        initialVoted={post.hasVoted}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium">{post.title}</h3>
          <StatusControl
            postId={post.id}
            status={post.status}
            canChange={canChangeStatus}
          />
        </div>
        {post.description && (
          <p className="mt-1 text-sm text-muted">{post.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CommentIcon className="h-3.5 w-3.5" />
            {post.comments}
            <span className="sr-only">comments</span>
          </span>
          <span>{post.authorName}</span>
        </div>
      </div>
    </div>
  );
}
