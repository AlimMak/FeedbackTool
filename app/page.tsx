import type { Role } from "@prisma/client";

import { logout } from "@/app/actions/auth";
import { OrgSwitcher } from "@/app/ui/org-switcher";
import { requireActiveOrg, withCurrentTenant, type OrgSummary } from "@/lib/dal";

// Always resolve the session and tenant-scoped data at request time.
export const dynamic = "force-dynamic";

type BoardView = { id: string; name: string };
type MemberView = { role: Role; name: string; email: string };

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
  const { activeOrgId, role, orgs } = await requireActiveOrg();

  // Authenticated but not a member of any organization yet.
  if (!activeOrgId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <TopBar orgs={orgs} activeOrgId={null} />
        <p className="mt-10 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Your account doesn&apos;t belong to any organization yet.
        </p>
      </main>
    );
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)!;

  // Tenant-scoped read: no `where: { organizationId }` anywhere — Postgres RLS
  // scopes these to the active organization via `app.current_tenant`, set by
  // withCurrentTenant() from the session.
  const { boards, members } = await withCurrentTenant(async (tx) => {
    const [boardRows, membershipRows] = await Promise.all([
      tx.board.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
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
      boards: boardRows satisfies BoardView[],
      members: membershipRows.map<MemberView>((m) => ({
        role: m.role,
        name: m.user.name,
        email: m.user.email,
      })),
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <TopBar orgs={orgs} activeOrgId={activeOrgId} />

      <header className="mt-8 mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{activeOrg.name}</h1>
          <span className="font-mono text-xs text-slate-400">
            /{activeOrg.slug}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          You are <RoleBadge role={role!} /> here. Everything below is loaded
          through{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
            withCurrentTenant()
          </code>{" "}
          — the active org from your session is pushed into the Postgres RLS
          context, so these queries carry <em>no explicit tenant filter</em>.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Boards ({boards.length})
          </h2>
          <ul className="mt-3 space-y-1">
            {boards.map((board) => (
              <li
                key={board.id}
                className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800/60"
              >
                <span className="text-slate-400">#</span>
                {board.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Members ({members.length})
          </h2>
          <ul className="mt-3 space-y-1">
            {members.map((member) => (
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
        </div>
      </section>
    </main>
  );
}

function TopBar({
  orgs,
  activeOrgId,
}: {
  orgs: OrgSummary[];
  activeOrgId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
      <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
      <form action={logout} className="ml-auto">
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
