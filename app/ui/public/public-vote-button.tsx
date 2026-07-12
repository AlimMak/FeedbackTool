"use client";

import { useState, useTransition } from "react";

import { publicToggleVote } from "@/app/actions/public";
import { ChevronUpIcon } from "../icons";

/** Anonymous upvote toggle for the public board. Dedupe + rate limiting happen
 * server-side (signed visitor cookie); this is optimistic UI over that. */
export function PublicVoteButton({
  orgSlug,
  boardSlug,
  postId,
  initialCount,
  initialVoted,
}: {
  orgSlug: string;
  boardSlug: string;
  postId: string;
  initialCount: number;
  initialVoted: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVoted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    const prev = { count, voted };
    setVoted(!voted);
    setCount(count + (voted ? -1 : 1));

    startTransition(async () => {
      const res = await publicToggleVote(orgSlug, boardSlug, postId);
      if ("error" in res) {
        setVoted(prev.voted);
        setCount(prev.count);
        setError(res.error);
      } else {
        setVoted(res.voted);
        setCount(res.count);
      }
    });
  }

  return (
    <div className="flex w-12 flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={voted}
        aria-label={voted ? "Remove your upvote" : "Upvote"}
        className={`flex w-11 flex-col items-center gap-0.5 rounded-md border-[0.5px] py-1.5 transition-colors ${
          voted
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border text-muted hover:border-border-strong hover:text-foreground"
        }`}
      >
        <ChevronUpIcon className="h-4 w-4" />
        <span className="text-sm font-medium tabular-nums">{count}</span>
      </button>
      {error && (
        <span className="mt-1 text-center text-[10px] leading-tight text-red-500">
          {error}
        </span>
      )}
    </div>
  );
}
