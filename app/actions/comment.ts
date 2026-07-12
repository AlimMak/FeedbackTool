"use server";

import { revalidatePath } from "next/cache";

import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";

/** Admin (authenticated) comment actions. Tenant-scoped via RLS. */

export type AdminCommentState = { error: string } | { ok: true } | undefined;

export async function addComment(
  postId: string,
  _prev: AdminCommentState,
  formData: FormData,
): Promise<AdminCommentState> {
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  if (body.length < 1) return { error: "Comment can't be empty." };
  if (body.length > 2000) return { error: "Comment is too long (max 2000)." };

  const { activeOrgId, userId } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };

  const result = await withCurrentTenant<AdminCommentState>(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) return { error: "Post not found." };

    if (parentId) {
      const parent = await tx.comment.findFirst({
        where: { id: parentId, postId },
        select: { id: true },
      });
      if (!parent) return { error: "Reply target not found." };
    }

    await tx.comment.create({
      data: { body, parentId, postId, organizationId: activeOrgId, authorId: userId },
    });
    return { ok: true };
  });

  if (result && "ok" in result) revalidatePath("/", "layout");
  return result;
}

export async function deleteComment(
  commentId: string,
): Promise<{ error?: string }> {
  const { activeOrgId, role } = await requireActiveOrg();
  if (!activeOrgId) return { error: "No active organization." };
  // "Admins" in this repo = organization OWNER.
  if (role !== "OWNER") {
    return { error: "Only organization owners can delete comments." };
  }

  await withCurrentTenant(async (tx) => {
    // deleteMany (RLS-scoped) so a comment outside the tenant is a no-op.
    // Replies cascade via the parent FK.
    await tx.comment.deleteMany({ where: { id: commentId } });
  });
  revalidatePath("/", "layout");
  return {};
}
