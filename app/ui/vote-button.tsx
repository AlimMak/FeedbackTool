"use client";

import { useState, useTransition } from "react";

import { toggleVote } from "@/app/actions/post";
import { ChevronUpIcon } from "./icons";

/**
 * Upvote toggle. Optimistic for snappiness, then reconciled with the
 * authoritative count the server returns. One-vote-per-user is enforced by the
 * DB unique constraint inside the action.
 */
export function VoteButton({
  postId,
  initialCount,
  initialVoted,
}: {
  postId: string;
  initialCount: number;
  initialVoted: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVoted);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const prev = { count, voted };
    // Optimistic update.
    setVoted(!voted);
    setCount(count + (voted ? -1 : 1));

    startTransition(async () => {
      try {
        const result = await toggleVote(postId);
        setVoted(result.voted);
        setCount(result.count);
      } catch {
        setVoted(prev.voted);
        setCount(prev.count);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={voted}
      aria-label={voted ? "Remove your upvote" : "Upvote"}
      className={`flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-md border-[0.5px] py-1.5 transition-colors ${
        voted
          ? "border-accent bg-accent-subtle text-accent"
          : "border-border text-muted hover:border-border-strong hover:text-foreground"
      }`}
    >
      <ChevronUpIcon className="h-4 w-4" />
      <span className="text-sm font-medium tabular-nums">{count}</span>
    </button>
  );
}
