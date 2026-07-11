"use server";

import { revalidatePath } from "next/cache";
import { PostStatus } from "@prisma/client";

import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";
import { assertCanCreatePost, PlanLimitError } from "@/lib/plans";

/** `useActionState` shape for post creation. */
export type CreatePostState =
  | { error: string; upgrade?: boolean }
  | { ok: true }
  | undefined;

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const boardId = String(formData.get("boardId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!boardId) return { error: "Missing board." };
  if (!title) return { error: "A title is required." };

  const { activeOrgId, userId } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };

  try {
    const result = await withCurrentTenant<CreatePostState>(async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: activeOrgId },
        select: { plan: true },
      });
      const board = await tx.board.findUnique({
        where: { id: boardId },
        select: { id: true },
      });
      if (!board) return { error: "Board not found." };

      // Server-side plan gate — throws PlanLimitError at the per-board cap.
      await assertCanCreatePost(tx, org.plan, boardId);
      await tx.post.create({
        data: {
          title,
          description: description || null,
          boardId,
          organizationId: activeOrgId,
          authorId: userId,
        },
      });
      return { ok: true };
    });
    if (result && "error" in result) return result;
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return { error: error.message, upgrade: true };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Toggle the current user's upvote on a post. One vote per user per post is
 * enforced by the DB unique constraint; this simply creates or removes it,
 * tenant-scoped through RLS. Returns the authoritative new state.
 */
export async function toggleVote(
  postId: string,
): Promise<{ voted: boolean; count: number }> {
  const { activeOrgId, userId } = await requireActiveOrg();
  if (!activeOrgId) throw new Error("No active organization.");

  return withCurrentTenant(async (tx) => {
    const existing = await tx.vote.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });

    if (existing) {
      await tx.vote.delete({ where: { id: existing.id } });
    } else {
      // Confirm the post is in this tenant before inserting (RLS also enforces).
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (!post) throw new Error("Post not found.");
      await tx.vote.create({
        data: { postId, userId, organizationId: activeOrgId },
      });
    }

    const count = await tx.vote.count({ where: { postId } });
    return { voted: existing === null, count };
  });
}

const VALID_STATUSES: ReadonlySet<PostStatus> = new Set([
  PostStatus.OPEN,
  PostStatus.PLANNED,
  PostStatus.IN_PROGRESS,
  PostStatus.DONE,
]);

/**
 * Change a post's roadmap status. Restricted to organization OWNERs (this repo's
 * only elevated role) — a non-owner is rejected server-side even if the UI is
 * bypassed. Tenant-scoped via RLS.
 */
export async function changeStatus(
  postId: string,
  status: PostStatus,
): Promise<{ error?: string }> {
  if (!VALID_STATUSES.has(status)) return { error: "Invalid status." };

  const { activeOrgId, role } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };
  if (role !== "OWNER") {
    return { error: "Only organization owners can change status." };
  }

  await withCurrentTenant(async (tx) => {
    // updateMany (not update) so a post outside the tenant is a no-op under RLS
    // rather than throwing.
    await tx.post.updateMany({ where: { id: postId }, data: { status } });
  });
  revalidatePath("/", "layout");
  return {};
}
