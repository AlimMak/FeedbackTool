"use client";

import { useActionState } from "react";

import { createBoard, type CreateState } from "@/app/actions/board";

export function CreateBoardForm() {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    createBoard,
    undefined,
  );

  return (
    <div>
      <form action={action} className="flex gap-2">
        <input
          name="name"
          placeholder="New board name"
          required
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add board"}
        </button>
      </form>
      {state?.error && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
