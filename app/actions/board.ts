"use server";

import { revalidatePath } from "next/cache";

import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";
import {
  assertCanCreateBoard,
  assertCanCreatePost,
  PlanLimitError,
} from "@/lib/plans";

/**
 * Shape returned to `useActionState`. `error` is a user-facing message
 * (including plan-limit "upgrade to Pro" prompts); `undefined` means success.
 */
export type CreateState = { error: string } | undefined;

export async function createBoard(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Board name is required." };

  const { activeOrgId } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };

  try {
    await withCurrentTenant(async (tx) => {
      // Read the org's current plan (RLS scopes this to the active org).
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: activeOrgId },
        select: { plan: true },
      });
      // SERVER-SIDE gate — the only real enforcement point.
      await assertCanCreateBoard(tx, org.plan);
      await tx.board.create({
        data: { name, organizationId: activeOrgId },
      });
    });
  } catch (error) {
    if (error instanceof PlanLimitError) return { error: error.message };
    throw error;
  }

  revalidatePath("/");
  return undefined;
}

export async function createPost(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const boardId = String(formData.get("boardId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!boardId) return { error: "Missing board." };
  if (!content) return { error: "Post content is required." };

  const { activeOrgId } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };

  try {
    const result = await withCurrentTenant<CreateState>(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: activeOrgId },
        select: { plan: true },
      });
      // Confirm the board exists in this tenant (RLS also enforces this).
      const board = await tx.board.findUnique({
        where: { id: boardId },
        select: { id: true },
      });
      if (!board) return { error: "Board not found." };

      // SERVER-SIDE gate — throws PlanLimitError when at the per-board cap.
      await assertCanCreatePost(tx, org.plan, boardId);
      await tx.post.create({
        data: { content, boardId, organizationId: activeOrgId },
      });
      return undefined;
    });
    if (result?.error) return result;
  } catch (error) {
    if (error instanceof PlanLimitError) return { error: error.message };
    throw error;
  }

  revalidatePath("/");
  return undefined;
}
