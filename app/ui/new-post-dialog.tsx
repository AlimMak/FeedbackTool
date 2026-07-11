"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createPost, type CreatePostState } from "@/app/actions/post";
import { Modal } from "./dialog";
import { UpgradeNotice } from "./upgrade-notice";

export function NewPostDialog({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<CreatePostState, FormData>(
    createPost,
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
  const inputClass =
    "w-full rounded-md border-[0.5px] border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <Modal onClose={onClose} title="New post">
      <form action={action} className="space-y-3">
        <input type="hidden" name="boardId" value={boardId} />
        <input
          name="title"
          autoFocus
          required
          placeholder="Title"
          className={inputClass}
        />
        <textarea
          name="description"
          rows={3}
          placeholder="Description (optional)"
          className={`${inputClass} resize-none`}
        />
        {error &&
          (error.upgrade ? (
            <UpgradeNotice message={error.error} />
          ) : (
            <p className="text-xs text-red-600 dark:text-red-400">
              {error.error}
            </p>
          ))}
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
            {pending ? "Adding…" : "Add post"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
