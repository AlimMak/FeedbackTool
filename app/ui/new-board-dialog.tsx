"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { createBoard, type CreateBoardState } from "@/app/actions/board";
import { Modal } from "./dialog";
import { UpgradeNotice } from "./upgrade-notice";

export function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<CreateBoardState, FormData>(
    createBoard,
    undefined,
  );
  const router = useRouter();

  useEffect(() => {
    if (state && "boardId" in state) {
      onClose();
      router.push(`/boards/${state.boardId}`);
    }
  }, [state, onClose, router]);

  const error = state && "error" in state ? state : null;

  return (
    <Modal onClose={onClose} title="New board">
      <form action={action} className="space-y-3">
        <input
          name="name"
          autoFocus
          required
          placeholder="Board name"
          className="w-full rounded-md border-[0.5px] border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
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
            {pending ? "Creating…" : "Create board"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
