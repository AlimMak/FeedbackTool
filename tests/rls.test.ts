import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPrisma } from "@/lib/prisma";
import {
  assertCanCreateBoard,
  assertCanCreatePost,
  PlanLimitError,
} from "@/lib/plans";
import { appPrisma, withTenant } from "@/lib/tenant-db";

// These tests exercise the tenant-isolation invariants directly against
// Postgres: they need `saas_owner` (DATABASE_URL) and `saas_app`
// (APP_DATABASE_URL) with migrations applied. Fixtures use random slugs and are
// torn down in afterAll, so the suite is safe to run against a dev database.

const rand = () => Math.random().toString(36).slice(2, 10);

let orgA: { id: string };
let orgB: { id: string };
let boardA: { id: string };

beforeAll(async () => {
  orgA = await adminPrisma.organization.create({
    data: { name: `Org A ${rand()}`, slug: `a-${rand()}` },
  });
  orgB = await adminPrisma.organization.create({
    data: { name: `Org B ${rand()}`, slug: `b-${rand()}` },
  });
  boardA = await adminPrisma.board.create({
    data: { name: "Roadmap", slug: `r-${rand()}`, organizationId: orgA.id },
  });
});

afterAll(async () => {
  await adminPrisma.organization.deleteMany({
    where: { id: { in: [orgA.id, orgB.id] } },
  });
  await Promise.all([adminPrisma.$disconnect(), appPrisma.$disconnect()]);
});

describe("RLS tenant isolation", () => {
  it("default-deny: no tenant context returns zero tenant rows", async () => {
    const rows = await appPrisma.board.findMany();
    expect(rows).toHaveLength(0);
  });

  it("read scoping: only the active tenant's rows are visible", async () => {
    const rows = await withTenant(orgA.id, (tx) => tx.board.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((b) => b.organizationId === orgA.id)).toBe(true);
    expect(rows.some((b) => b.id === boardA.id)).toBe(true);
  });

  it("no cross-tenant read: org B cannot see org A's board by id", async () => {
    const rows = await withTenant(orgB.id, (tx) =>
      tx.board.findMany({ where: { id: boardA.id } }),
    );
    expect(rows).toHaveLength(0);
  });

  it("no cross-tenant write: WITH CHECK rejects inserting for another org", async () => {
    await expect(
      withTenant(orgB.id, (tx) =>
        tx.board.create({
          data: { name: "sneaky", slug: `x-${rand()}`, organizationId: orgA.id },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("Plan limits (server-side enforcement)", () => {
  it("FREE org is blocked once at the board cap", async () => {
    // orgA is FREE (default) with exactly one board.
    await withTenant(orgA.id, async (tx) => {
      await expect(assertCanCreateBoard(tx, "FREE")).rejects.toBeInstanceOf(
        PlanLimitError,
      );
    });
  });

  it("PRO org has no board cap", async () => {
    await withTenant(orgA.id, async (tx) => {
      await expect(
        assertCanCreateBoard(tx, "PRO"),
      ).resolves.toBeUndefined();
    });
  });

  it("FREE org is blocked at 50 posts per board", async () => {
    await adminPrisma.post.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        title: `post ${i}`,
        boardId: boardA.id,
        organizationId: orgA.id,
      })),
    });
    await withTenant(orgA.id, async (tx) => {
      await expect(
        assertCanCreatePost(tx, "FREE", boardA.id),
      ).rejects.toBeInstanceOf(PlanLimitError);
    });
  });
});

describe("Vote dedupe", () => {
  it("one vote per visitor per post is enforced by the unique constraint", async () => {
    const post = await adminPrisma.post.create({
      data: { title: "votable", boardId: boardA.id, organizationId: orgA.id },
    });
    await withTenant(orgA.id, (tx) =>
      tx.vote.create({
        data: { postId: post.id, visitorId: "visitor-1", organizationId: orgA.id },
      }),
    );
    await expect(
      withTenant(orgA.id, (tx) =>
        tx.vote.create({
          data: {
            postId: post.id,
            visitorId: "visitor-1",
            organizationId: orgA.id,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
