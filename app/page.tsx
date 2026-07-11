import { adminPrisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import type { Role } from "@prisma/client";

// Always query the database at request time (never statically cached).
export const dynamic = "force-dynamic";

type BoardView = { id: string; name: string; createdAt: Date };
type MemberView = { role: Role; name: string; email: string };
type OrgView = {
  id: string;
  name: string;
  slug: string;
  boards: BoardView[];
  members: MemberView[];
};

type IsolationProbe = {
  verified: boolean;
  contextOrg: string;
  targetOrg: string;
};

type PageData = {
  orgs: OrgView[];
  isolation: IsolationProbe | null;
};

async function loadData(): Promise<PageData> {
  // System path (RLS-bypassing owner role): enumerate every tenant.
  const organizations = await adminPrisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  // Tenant-scoped path (RLS enforced): for each org, set the tenant context and
  // read its boards + members. RLS guarantees only this org's rows come back —
  // note there is no `where: { organizationId }` filter anywhere below.
  const orgs: OrgView[] = await Promise.all(
    organizations.map((org) =>
      withTenant(org.id, async (tx): Promise<OrgView> => {
        const [boards, memberships] = await Promise.all([
          tx.board.findMany({
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, createdAt: true },
          }),
          tx.membership.findMany({
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
              role: true,
              user: { select: { name: true, email: true } },
            },
          }),
        ]);
        return {
          ...org,
          boards,
          members: memberships.map((m) => ({
            role: m.role,
            name: m.user.name,
            email: m.user.email,
          })),
        };
      }),
    ),
  );

  // Explicit cross-tenant probe: while in org B's tenant context, deliberately
  // ask for org A's boards by id. RLS must return zero rows.
  let isolation: IsolationProbe | null = null;
  if (organizations.length >= 2) {
    const [orgA, orgB] = organizations;
    const leaked = await withTenant(orgB.id, (tx) =>
      tx.board.findMany({ where: { organizationId: orgA.id } }),
    );
    isolation = {
      verified: leaked.length === 0,
      contextOrg: orgB.name,
      targetOrg: orgA.name,
    };
  }

  return { orgs, isolation };
}

function RoleBadge({ role }: { role: Role }) {
  const styles =
    role === "OWNER"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${styles}`}
    >
      {role}
    </span>
  );
}

export default async function Home() {
  const { orgs, isolation } = await loadData();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Multi-tenant scaffold
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Organizations &amp; Boards
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Every organization card below is loaded through{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
            withTenant(org.id)
          </code>
          . The board and member rows are returned{" "}
          <em>without any explicit tenant filter</em> — Postgres Row-Level
          Security scopes them to the active tenant.
        </p>

        {isolation && (
          <div
            className={`mt-6 flex items-start gap-3 rounded-lg border p-4 text-sm ${
              isolation.verified
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            }`}
          >
            <span className="text-base leading-none">
              {isolation.verified ? "✓" : "✗"}
            </span>
            <span>
              <strong>
                RLS isolation {isolation.verified ? "verified" : "FAILED"}.
              </strong>{" "}
              Querying <em>{isolation.targetOrg}</em>&apos;s boards while in{" "}
              <em>{isolation.contextOrg}</em>&apos;s tenant context returned{" "}
              {isolation.verified ? "zero rows" : "leaked rows"}.
            </span>
          </div>
        )}
      </header>

      {orgs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No organizations found. Run{" "}
          <code className="font-mono">npm run db:seed</code>.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {orgs.map((org) => (
            <section
              key={org.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{org.name}</h2>
                <span className="font-mono text-xs text-slate-400">
                  /{org.slug}
                </span>
              </div>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Boards ({org.boards.length})
              </h3>
              <ul className="mt-2 space-y-1">
                {org.boards.map((board) => (
                  <li
                    key={board.id}
                    className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800/60"
                  >
                    <span className="text-slate-400">#</span>
                    {board.name}
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Members ({org.members.length})
              </h3>
              <ul className="mt-2 space-y-1">
                {org.members.map((member) => (
                  <li
                    key={member.email}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{member.name}</span>{" "}
                      <span className="text-slate-400">{member.email}</span>
                    </span>
                    <RoleBadge role={member.role} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
