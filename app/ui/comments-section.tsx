"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteComment } from "@/app/actions/comment";
import type { CommentNode } from "@/lib/comments";
import {
  CommentComposer,
  type CommentFormAction,
} from "./comment-composer";

/**
 * Comment list + composer, shared by the public post page (anonymous, name
 * optional) and the admin post page (delete enabled). One level of nested
 * replies ("threaded-lite").
 */
export function CommentsSection({
  comments,
  addAction,
  withName,
  canDelete,
}: {
  comments: CommentNode[];
  addAction: CommentFormAction;
  withName: boolean;
  canDelete: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium">
        Comments{comments.length > 0 ? ` (${countAll(comments)})` : ""}
      </h2>

      <div className="mt-3 space-y-2">
        {comments.length === 0 ? (
          <p className="text-sm text-muted">No comments yet. Start the discussion.</p>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              node={c}
              addAction={addAction}
              withName={withName}
              canDelete={canDelete}
              depth={0}
            />
          ))
        )}
      </div>

      <div className="mt-4 rounded-card border-[0.5px] border-border bg-surface p-3">
        <CommentComposer
          action={addAction}
          withName={withName}
          placeholder="Add a comment…"
        />
      </div>
    </section>
  );
}

function countAll(nodes: CommentNode[]): number {
  return nodes.reduce((n, c) => n + 1 + countAll(c.replies), 0);
}

function CommentItem({
  node,
  addAction,
  withName,
  canDelete,
  depth,
}: {
  node: CommentNode;
  addAction: CommentFormAction;
  withName: boolean;
  canDelete: boolean;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onDelete() {
    startTransition(async () => {
      await deleteComment(node.id);
      router.refresh();
    });
  }

  return (
    <div className={depth > 0 ? "ml-5 border-l-[0.5px] border-border pl-3" : ""}>
      <div className="rounded-card border-[0.5px] border-border bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{node.author}</span>
          <span className="text-xs text-muted">{node.timeLabel}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{node.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs">
          {depth === 0 && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="text-muted hover:text-foreground"
            >
              Reply
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
        {replying && (
          <div className="mt-2">
            <CommentComposer
              action={addAction}
              withName={withName}
              parentId={node.id}
              onDone={() => setReplying(false)}
              placeholder="Write a reply…"
            />
          </div>
        )}
      </div>

      {node.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.replies.map((r) => (
            <CommentItem
              key={r.id}
              node={r}
              addAction={addAction}
              withName={withName}
              canDelete={canDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
