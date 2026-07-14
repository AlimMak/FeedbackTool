/**
 * Production first-run: create your FIRST real organization and its owner login
 * from environment variables. Idempotent — safe to re-run; it never overwrites
 * an existing user's password or duplicates the org/membership.
 *
 * Do NOT run `npm run db:seed` in production — that inserts fake demo orgs. Use
 * this instead:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' \
 *   ADMIN_ORG_NAME='Your Company' npm run create-admin
 *
 * Connects as the owner role (DATABASE_URL), which is correct for provisioning
 * (creating an org + user is inherently cross-tenant).
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import { slugify, uniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const orgName = process.env.ADMIN_ORG_NAME?.trim();

  if (!email || !password || !orgName) {
    console.error(
      "Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_ORG_NAME (see .env.example), " +
        "then re-run `npm run create-admin`.",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const name = email.split("@")[0] || email;

  // Upsert the user. On re-run, `update: {}` deliberately leaves the existing
  // name/password untouched (this script never clobbers credentials).
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash },
  });

  // Reuse an org this user already owns with the same name; otherwise create one
  // with a unique slug.
  const existingOrg = await prisma.organization.findFirst({
    where: {
      name: orgName,
      memberships: { some: { userId: user.id, role: Role.OWNER } },
    },
    select: { id: true },
  });

  let orgId = existingOrg?.id;
  if (!orgId) {
    const taken = new Set(
      (await prisma.organization.findMany({ select: { slug: true } })).map(
        (o) => o.slug,
      ),
    );
    const org = await prisma.organization.create({
      data: { name: orgName, slug: uniqueSlug(slugify(orgName), taken) },
      select: { id: true },
    });
    orgId = org.id;
  }

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    update: { role: Role.OWNER },
    create: { organizationId: orgId, userId: user.id, role: Role.OWNER },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.log(
    `Ready: ${email} is OWNER of "${orgName}". Sign in at ${appUrl}/login`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
