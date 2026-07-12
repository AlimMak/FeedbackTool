"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type CommentFormState = { error: string } | { ok: true } | undefined;
export type CommentFormAction = (
  prev: CommentFormState,
  formData: FormData,
) => Promise<CommentFormState>;

const inputClass =
  "w-full rounded-md border-[0.5px] border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

/**
 * Reusable comment/reply form. The `action` is a server action bound to its
 * context (post + slugs for public, post for admin), so this component doesn't
 * know or care which surface it's on.
 */
export function CommentComposer({
  action,
  withName,
  parentId,
  onDone,
  placeholder,
}: {
  action: CommentFormAction;
  withName: boolean;
  parentId?: string;
  onDone?: () => void;
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state && "ok" in state) {
      formRef.current?.reset();
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {withName && (
        <input
          name="name"
          placeholder="Your name (optional)"
          maxLength={60}
          className={inputClass}
        />
      )}
      <textarea
        name="body"
        required
        rows={2}
        maxLength={2000}
        placeholder={placeholder ?? "Add a comment…"}
        className={`${inputClass} resize-none`}
      />
      {state && "error" in state && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <div className="flex justify-end gap-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border-[0.5px] border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
