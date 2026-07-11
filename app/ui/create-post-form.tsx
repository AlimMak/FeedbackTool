"use client";

import { useActionState } from "react";

import { createPost, type CreateState } from "@/app/actions/board";

export function CreatePostForm({ boardId }: { boardId: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    createPost,
    undefined,
  );

  return (
    <div className="mt-2">
      <form action={action} className="flex gap-2">
        <input type="hidden" name="boardId" value={boardId} />
        <input
          name="content"
          placeholder="Add a post…"
          required
          className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {pending ? "…" : "Post"}
        </button>
      </form>
      {state?.error && (
        <p
          role="alert"
          className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
