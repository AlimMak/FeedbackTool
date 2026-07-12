"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  publicSubmitPost,
  type PublicSubmitState,
} from "@/app/actions/public";
import { Modal } from "../dialog";

const inputClass =
  "w-full rounded-md border-[0.5px] border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

/** "Suggest a feature" dialog for anonymous end-users. */
export function SuggestDialog({
  orgSlug,
  boardSlug,
  onClose,
}: {
  orgSlug: string;
  boardSlug: string;
  onClose: () => void;
}) {
  const submit = publicSubmitPost.bind(null, orgSlug, boardSlug);
  const [state, action, pending] = useActionState<PublicSubmitState, FormData>(
    submit,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state && "ok" in state) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const error = state && "error" in state ? state : null;

  return (
    <Modal onClose={onClose} title="Suggest a feature">
      <form action={action} className="space-y-3">
        <input
          name="title"
          autoFocus
          required
          minLength={3}
          maxLength={120}
          placeholder="Title"
          className={inputClass}
        />
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          placeholder="Describe your idea (optional)"
          className={`${inputClass} resize-none`}
        />
        <input
          name="email"
          type="email"
          placeholder="Email (optional — to follow up)"
          className={inputClass}
        />
        {error && (
          <p
            className={`text-xs ${error.closed ? "text-muted" : "text-red-600 dark:text-red-400"}`}
          >
            {error.error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border-[0.5px] border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
