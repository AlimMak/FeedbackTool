"use server";

import { revalidatePath } from "next/cache";

import { assertCanCreatePost, PlanLimitError } from "@/lib/plans";
import { getClientIp, resolvePublicOrg, withPublicTenant } from "@/lib/public";
import { rateLimit } from "@/lib/rate-limit";
import { getOrCreateVisitorId } from "@/lib/visitor";

/**
 * Server actions for the public, unauthenticated board. All of them:
 *   - resolve the tenant from the URL slug (never a session),
 *   - run every data query through withPublicTenant (RLS enforced),
 *   - validate input and apply basic per-IP / per-visitor rate limits.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function publicToggleVote(
  orgSlug: string,
  boardSlug: string,
  postId: string,
): Promise<{ voted: boolean; count: number } | { error: string }> {
  const org = await resolvePublicOrg(orgSlug);
  if (!org) return { error: "Board not found." };

  const visitorId = await getOrCreateVisitorId();
  const ip = await getClientIp();
  if (!rateLimit(`vote:${org.id}:${ip}:${visitorId}`, 30, 60_000).ok) {
    return { error: "You're voting too fast — try again in a moment." };
  }

  return withPublicTenant(org.id, async (tx) => {
    // Only posts on THIS public board are votable (RLS + these filters).
    const post = await tx.post.findFirst({
      where: { id: postId, board: { slug: boardSlug, isPublic: true } },
      select: { id: true },
    });
    if (!post) return { error: "Post not found." };

    const existing = await tx.vote.findUnique({
      where: { postId_visitorId: { postId, visitorId } },
      select: { id: true },
    });
    if (existing) {
      await tx.vote.delete({ where: { id: existing.id } });
    } else {
      await tx.vote.create({
        data: { postId, visitorId, organizationId: org.id },
      });
    }
    const count = await tx.vote.count({ where: { postId } });
    return { voted: existing === null, count };
  });
}

export type PublicSubmitState =
  | { error: string; closed?: boolean }
  | { ok: true }
  | undefined;

export async function publicSubmitPost(
  orgSlug: string,
  boardSlug: string,
  _prev: PublicSubmitState,
  formData: FormData,
): Promise<PublicSubmitState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (title.length < 3) {
    return { error: "Please enter a title (at least 3 characters)." };
  }
  if (title.length > 120) return { error: "Title is too long (max 120)." };
  if (description.length > 2000) {
    return { error: "Description is too long (max 2000)." };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: "That email address doesn't look right." };
  }

  const org = await resolvePublicOrg(orgSlug);
  if (!org) return { error: "Board not found." };

  const ip = await getClientIp();
  if (!rateLimit(`submit:${org.id}:${ip}`, 5, 10 * 60_000).ok) {
    return { error: "You've submitted a lot recently — please try again later." };
  }

  const result = await withPublicTenant<PublicSubmitState>(
    org.id,
    async (tx) => {
      const board = await tx.board.findFirst({
        where: { slug: boardSlug, isPublic: true },
        select: { id: true },
      });
      if (!board) return { error: "Board not found." };

      const orgRow = await tx.organization.findFirstOrThrow({
        select: { plan: true },
      });
      try {
        // Public submissions count against the same plan limit as admin ones.
        await assertCanCreatePost(tx, orgRow.plan, board.id);
      } catch (e) {
        if (e instanceof PlanLimitError) {
          return {
            error: "This board isn't accepting new suggestions right now.",
            closed: true,
          };
        }
        throw e;
      }

      await tx.post.create({
        data: {
          title,
          description: description || null,
          submitterEmail: email || null,
          status: "OPEN",
          boardId: board.id,
          organizationId: org.id,
          // authorId stays null — anonymous submission.
        },
      });
      return { ok: true };
    },
  );

  if (result && "ok" in result) {
    revalidatePath(`/b/${orgSlug}/${boardSlug}`);
  }
  return result;
}

export type PublicCommentState = { error: string } | { ok: true } | undefined;

export async function publicAddComment(
  orgSlug: string,
  boardSlug: string,
  postId: string,
  _prev: PublicCommentState,
  formData: FormData,
): Promise<PublicCommentState> {
  const body = String(formData.get("body") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim() || null;

  if (body.length < 1) return { error: "Comment can't be empty." };
  if (body.length > 2000) return { error: "Comment is too long (max 2000)." };
  if (name.length > 60) return { error: "Name is too long (max 60)." };

  const org = await resolvePublicOrg(orgSlug);
  if (!org) return { error: "Not found." };

  const ip = await getClientIp();
  if (!rateLimit(`comment:${org.id}:${ip}`, 10, 5 * 60_000).ok) {
    return { error: "You're commenting too fast — please slow down." };
  }

  const result = await withPublicTenant<PublicCommentState>(
    org.id,
    async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, board: { slug: boardSlug, isPublic: true } },
        select: { id: true },
      });
      if (!post) return { error: "Not found." };

      if (parentId) {
        const parent = await tx.comment.findFirst({
          where: { id: parentId, postId },
          select: { id: true },
        });
        if (!parent) return { error: "Reply target not found." };
      }

      await tx.comment.create({
        data: {
          body,
          authorName: name || null,
          parentId,
          postId,
          organizationId: org.id,
          // authorId stays null — anonymous comment.
        },
      });
      return { ok: true };
    },
  );

  if (result && "ok" in result) {
    revalidatePath(`/b/${orgSlug}/${boardSlug}/${postId}`);
  }
  return result;
}
