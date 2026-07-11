"use client";

import { useState } from "react";
import { PostStatus } from "@prisma/client";

import { NewPostDialog } from "./new-post-dialog";
import { PostCard, type PostCardData } from "./post-card";
import { PlusIcon } from "./icons";
import { STATUS_META, STATUS_ORDER } from "./status-pill";

type Filter = PostStatus | "ALL";

export type BoardUsage = { used: number; limit: number } | null;

export function BoardBody({
  boardId,
  boardName,
  usage,
  posts,
  canChangeStatus,
}: {
  boardId: string;
  boardName: string;
  usage: BoardUsage;
  posts: PostCardData[];
  canChangeStatus: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible =
    filter === "ALL" ? posts : posts.filter((p) => p.status === filter);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">{boardName}</h1>
          {usage && (
            <p className="mt-0.5 text-xs text-muted">
              {usage.used} of {usage.limit} posts used
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Filter by status</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="rounded-md border-[0.5px] border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
            >
              <option value="ALL">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" />
            New post
          </button>
        </div>
      </header>

      <div className="mt-5 space-y-2">
        {visible.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-dashed border-border px-6 py-10 text-center text-sm text-muted">
            {posts.length === 0
              ? "No posts yet — add the first one."
              : "No posts with this status."}
          </p>
        ) : (
          visible.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canChangeStatus={canChangeStatus}
            />
          ))
        )}
      </div>

      {dialogOpen && (
        <NewPostDialog boardId={boardId} onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}
