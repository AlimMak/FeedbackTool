"use server";

import { revalidatePath } from "next/cache";

import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";
import { assertCanCreateBoard, PlanLimitError } from "@/lib/plans";

/**
 * `useActionState` shape for board creation. On success returns the new board's
 * id (so the UI can navigate to it); on a plan limit returns a friendly message.
 */
export type CreateBoardState =
  | { error: string; upgrade?: boolean }
  | { boardId: string }
  | undefined;

export async function createBoard(
  _prev: CreateBoardState,
  formData: FormData,
): Promise<CreateBoardState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Board name is required." };

  const { activeOrgId } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };

  try {
    const boardId = await withCurrentTenant(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: activeOrgId },
        select: { plan: true },
      });
      // Server-side plan gate — the authoritative check.
      await assertCanCreateBoard(tx, org.plan);
      const board = await tx.board.create({
        data: { name, organizationId: activeOrgId },
        select: { id: true },
      });
      return board.id;
    });
    revalidatePath("/", "layout");
    return { boardId };
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return { error: error.message, upgrade: true };
    }
    throw error;
  }
}
