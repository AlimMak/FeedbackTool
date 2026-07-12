import { PrismaClient, Role, PostStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import { slugify } from "../lib/slug";

// The seed connects as `saas_owner` (DATABASE_URL) and therefore bypasses RLS,
// which is exactly what's needed to write across multiple tenants in one pass.
const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("Seeding database…");

  // Shared dev password for every seeded account (dev-only). The Credentials
  // provider (auth.ts) compares against this bcrypt hash on sign-in.
  const passwordHash = await bcrypt.hash("password123", 10);

  // --- Users (global identities; not tenant-scoped) --------------------------
  const alice = await prisma.user.upsert({
    where: { email: "alice@acme.test" },
    update: { passwordHash },
    create: { email: "alice@acme.test", name: "Alice Anderson", passwordHash },
  });
  const bob = await prisma.user.upsert({
    where: { email: "bob@acme.test" },
    update: { passwordHash },
    create: { email: "bob@acme.test", name: "Bob Brown", passwordHash },
  });
  const carol = await prisma.user.upsert({
    where: { email: "carol@globex.test" },
    update: { passwordHash },
    create: { email: "carol@globex.test", name: "Carol Clark", passwordHash },
  });
  // Dave belongs to BOTH orgs — the reason User is global rather than
  // tenant-owned. Sign in as dave@contractor.test to exercise org switching.
  const dave = await prisma.user.upsert({
    where: { email: "dave@contractor.test" },
    update: { passwordHash },
    create: {
      email: "dave@contractor.test",
      name: "Dave Davis",
      passwordHash,
    },
  });

  // --- Organizations (tenants) ----------------------------------------------
  const acme = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme Inc", slug: "acme" },
  });
  const globex = await prisma.organization.upsert({
    where: { slug: "globex" },
    update: {},
    create: { name: "Globex Corp", slug: "globex" },
  });

  // --- Memberships (User ↔ Organization, with role) --------------------------
  const memberships: ReadonlyArray<{
    organizationId: string;
    userId: string;
    role: Role;
  }> = [
    { organizationId: acme.id, userId: alice.id, role: Role.OWNER },
    { organizationId: acme.id, userId: bob.id, role: Role.MEMBER },
    { organizationId: acme.id, userId: dave.id, role: Role.MEMBER },
    { organizationId: globex.id, userId: carol.id, role: Role.OWNER },
    { organizationId: globex.id, userId: dave.id, role: Role.MEMBER },
  ];
  for (const m of memberships) {
    await prisma.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: m.organizationId,
          userId: m.userId,
        },
      },
      update: { role: m.role },
      create: m,
    });
  }

  // --- Boards, posts, votes, comments ---------------------------------------
  // Idempotent: clearing the boards cascades to their posts, votes and comments
  // (onDelete: Cascade), so re-seeding rebuilds a clean, realistic dataset.
  await prisma.board.deleteMany({
    where: { organizationId: { in: [acme.id, globex.id] } },
  });

  type PostSpec = {
    title: string;
    description?: string;
    status: PostStatus;
    author: { id: string };
    voters: ReadonlyArray<{ id: string }>;
    comments?: ReadonlyArray<{
      author?: { id: string };
      authorName?: string;
      body: string;
    }>;
  };

  async function seedBoard(
    org: { id: string },
    name: string,
    posts: ReadonlyArray<PostSpec>,
    isPublic = false,
  ): Promise<void> {
    const board = await prisma.board.create({
      data: { name, slug: slugify(name), isPublic, organizationId: org.id },
    });
    for (const spec of posts) {
      await prisma.post.create({
        data: {
          title: spec.title,
          description: spec.description,
          status: spec.status,
          boardId: board.id,
          organizationId: org.id,
          authorId: spec.author.id,
          votes: {
            create: spec.voters.map((u) => ({
              userId: u.id,
              organizationId: org.id,
            })),
          },
          comments: {
            create: (spec.comments ?? []).map((c) => ({
              body: c.body,
              authorId: c.author?.id ?? null,
              authorName: c.authorName ?? null,
              organizationId: org.id,
            })),
          },
        },
      });
    }
  }

  await seedBoard(acme, "Q3 Roadmap", [
    {
      title: "Dark mode",
      description: "A proper dark theme that respects the system setting.",
      status: PostStatus.IN_PROGRESS,
      author: bob,
      voters: [alice, bob, dave],
      comments: [
        { author: alice, body: "Yes please — my eyes will thank you." },
        { author: dave, body: "Make sure charts are readable in dark too." },
        { authorName: "Sam", body: "Been waiting for this. +1 from a customer." },
      ],
    },
    {
      title: "Bulk export to CSV",
      description: "Export boards and posts to CSV for offline analysis.",
      status: PostStatus.PLANNED,
      author: dave,
      voters: [bob, dave],
      comments: [{ author: bob, body: "Would use this weekly." }],
    },
    {
      title: "Slack integration",
      description: "Post notifications to a Slack channel on new activity.",
      status: PostStatus.OPEN,
      author: alice,
      voters: [alice],
    },
    {
      title: "SSO / SAML login",
      description: "Enterprise single sign-on for larger teams.",
      status: PostStatus.PLANNED,
      author: alice,
      voters: [alice, bob, dave],
      comments: [
        { author: bob, body: "Okta support would unblock our rollout." },
        { author: dave, body: "+1 for SAML." },
        { author: alice, body: "Tracking this for next quarter." },
      ],
    },
    {
      title: "Keyboard shortcuts",
      description: "Navigate and vote without leaving the keyboard.",
      status: PostStatus.DONE,
      author: bob,
      voters: [bob],
      comments: [{ author: dave, body: "Shipped and lovely." }],
    },
    {
      title: "Native mobile app",
      description: "iOS and Android apps for on-the-go feedback.",
      status: PostStatus.OPEN,
      author: dave,
      voters: [],
    },
  ], true);

  await seedBoard(acme, "Marketing", [
    {
      title: "Public roadmap page",
      description: "A shareable, read-only view of what's planned.",
      status: PostStatus.PLANNED,
      author: alice,
      voters: [alice, dave],
    },
    {
      title: "Case studies section",
      status: PostStatus.OPEN,
      author: bob,
      voters: [bob],
    },
  ]);

  // An intentionally empty board to show the empty state.
  await seedBoard(acme, "Engineering", []);

  await seedBoard(globex, "Launch Plan", [
    {
      title: "Beta invite flow",
      description: "Waitlist and staged invites for the beta.",
      status: PostStatus.IN_PROGRESS,
      author: carol,
      voters: [carol, dave],
      comments: [{ author: dave, body: "Can we invite in batches?" }],
    },
  ], true);

  await seedBoard(globex, "Design System", [
    {
      title: "Token naming conventions",
      description: "Agree on semantic names for color and spacing tokens.",
      status: PostStatus.PLANNED,
      author: carol,
      voters: [carol],
    },
  ]);

  const [orgCount, userCount, boardCount, postCount, voteCount] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.board.count(),
      prisma.post.count(),
      prisma.vote.count(),
    ]);
  console.log(
    `Seed complete: ${orgCount} orgs, ${userCount} users, ${boardCount} boards, ` +
      `${postCount} posts, ${voteCount} votes.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
