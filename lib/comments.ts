/**
 * Shared comment shaping for the public and admin post-detail views. Turns a
 * flat list of comment rows into a one-level "threaded-lite" tree and computes
 * display labels server-side (so no locale/hydration surprises on the client).
 */

export type CommentInput = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  authorName: string | null;
  author: { name: string } | null;
};

export type CommentNode = {
  id: string;
  body: string;
  author: string;
  timeLabel: string;
  replies: CommentNode[];
};

function authorLabel(c: CommentInput): string {
  return c.author?.name ?? c.authorName ?? "Anonymous";
}

function timeLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Build top-level comments with one level of nested replies. Expects rows
 * ordered by createdAt ascending. */
export function buildCommentTree(rows: readonly CommentInput[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const c of rows) {
    nodes.set(c.id, {
      id: c.id,
      body: c.body,
      author: authorLabel(c),
      timeLabel: timeLabel(c.createdAt),
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const c of rows) {
    const node = nodes.get(c.id)!;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}
