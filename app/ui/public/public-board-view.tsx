"use client";

import { useState } from "react";
import { PostStatus } from "@prisma/client";

import { PlusIcon } from "../icons";
import { STATUS_META, STATUS_ORDER } from "../status-pill";
import { PublicPostCard, type PublicPostData } from "./public-post-card";
import { SuggestDialog } from "./suggest-form";

type Filter = PostStatus | "ALL";

export function PublicBoardView({
  orgSlug,
  boardSlug,
  posts,
  submissionsClosed,
}: {
  orgSlug: string;
  boardSlug: string;
  posts: PublicPostData[];
  submissionsClosed: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible =
    filter === "ALL" ? posts : posts.filter((p) => p.status === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          disabled={submissionsClosed}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" />
          Suggest a feature
        </button>
      </div>

      {submissionsClosed && (
        <p className="mt-2 text-xs text-muted">
          This board isn&apos;t accepting new suggestions right now.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {visible.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-dashed border-border px-6 py-10 text-center text-sm text-muted">
            {posts.length === 0
              ? "No posts yet — be the first to suggest something."
              : "No posts with this status."}
          </p>
        ) : (
          visible.map((post) => (
            <PublicPostCard
              key={post.id}
              post={post}
              orgSlug={orgSlug}
              boardSlug={boardSlug}
            />
          ))
        )}
      </div>

      {dialogOpen && (
        <SuggestDialog
          orgSlug={orgSlug}
          boardSlug={boardSlug}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
