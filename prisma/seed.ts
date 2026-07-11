import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  // --- Boards (a couple per org) --------------------------------------------
  // Idempotent: clear and recreate this seed's boards for these two orgs.
  await prisma.board.deleteMany({
    where: { organizationId: { in: [acme.id, globex.id] } },
  });
  await prisma.board.createMany({
    data: [
      { name: "Q3 Roadmap", organizationId: acme.id },
      { name: "Marketing", organizationId: acme.id },
      { name: "Engineering", organizationId: acme.id },
      { name: "Launch Plan", organizationId: globex.id },
      { name: "Design System", organizationId: globex.id },
    ],
  });

  const [orgCount, userCount, boardCount] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.board.count(),
  ]);
  console.log(
    `Seed complete: ${orgCount} orgs, ${userCount} users, ${boardCount} boards.`,
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
