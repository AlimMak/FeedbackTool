"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PostStatus } from "@prisma/client";

import { changeStatus } from "@/app/actions/post";
import { StatusPill, STATUS_META, STATUS_ORDER } from "./status-pill";

/**
 * Status display. For members it's a read-only pill; for OWNERs it's a native
 * <select> styled as the pill (the server action re-checks the role regardless).
 */
export function StatusControl({
  postId,
  status,
  canChange,
}: {
  postId: string;
  status: PostStatus;
  canChange: boolean;
}) {
  const [current, setCurrent] = useState<PostStatus>(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canChange) return <StatusPill status={status} />;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as PostStatus;
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await changeStatus(postId, next);
      if (result.error) {
        setCurrent(prev);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="relative inline-flex">
      <span className="sr-only">Change status</span>
      <select
        value={current}
        onChange={onChange}
        disabled={pending}
        className={`cursor-pointer appearance-none rounded-full py-0.5 pl-2 pr-6 text-xs font-medium outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 ${STATUS_META[current].className}`}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-current">
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}
