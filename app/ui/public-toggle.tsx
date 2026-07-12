"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { toggleBoardPublic } from "@/app/actions/board";

/** Accessible on/off switch for a board's public visibility (OWNER-only). */
export function PublicToggle({
  boardId,
  initial,
}: {
  boardId: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await toggleBoardPublic(boardId, next);
      if (result.error) setOn(!next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Public board"
      onClick={toggle}
      disabled={pending}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        on ? "bg-accent" : "bg-surface-2 border-[0.5px] border-border"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          on ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}
