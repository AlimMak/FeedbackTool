import type { Plan, Prisma } from "@prisma/client";

/**
 * Plan tiers and their feature limits — the single source of truth for what a
 * FREE vs PRO organization may do. Enforcement is **server-side**: the frontend
 * may read these to show hints, but the gate that actually blocks creation lives
 * in {@link assertCanCreateBoard} / {@link assertCanCreatePost}, which run inside
 * the tenant transaction where the counts are RLS-scoped to the active org.
 *
 * `null` means unlimited.
 */
export type PlanLimits = {
  maxBoards: number | null;
  maxPostsPerBoard: number | null;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: { maxBoards: 1, maxPostsPerBoard: 50 },
  PRO: { maxBoards: null, maxPostsPerBoard: null },
};

/**
 * Thrown when a FREE org hits a plan limit. Server actions catch this and turn
 * it into a friendly, "upgrade to Pro" message for the user — it is never a 500.
 */
export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * Block board creation when the org is at its plan's board cap.
 *
 * `tx` is a tenant-scoped transaction client (from withCurrentTenant), so
 * `board.count()` counts only the active org's boards under RLS — no explicit
 * organization filter.
 */
export async function assertCanCreateBoard(
  tx: Prisma.TransactionClient,
  plan: Plan,
): Promise<void> {
  const limit = PLAN_LIMITS[plan].maxBoards;
  if (limit === null) return;

  const count = await tx.board.count();
  if (count >= limit) {
    throw new PlanLimitError(
      `Your ${plan} plan is limited to ${limit} board${limit === 1 ? "" : "s"}. ` +
        `Upgrade to Pro for unlimited boards.`,
    );
  }
}

/**
 * Block post creation when the target board is at its plan's per-board cap.
 * Counts are RLS-scoped, and the board id is additionally within the active org
 * because the caller resolved it under the same tenant context.
 */
export async function assertCanCreatePost(
  tx: Prisma.TransactionClient,
  plan: Plan,
  boardId: string,
): Promise<void> {
  const limit = PLAN_LIMITS[plan].maxPostsPerBoard;
  if (limit === null) return;

  const count = await tx.post.count({ where: { boardId } });
  if (count >= limit) {
    throw new PlanLimitError(
      `Your ${plan} plan is limited to ${limit} posts per board. ` +
        `Upgrade to Pro for unlimited posts.`,
    );
  }
}
