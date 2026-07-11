import Link from "next/link";
import type { Plan, Role } from "@prisma/client";

import { logout } from "@/app/actions/auth";
import { CreateBoardForm } from "@/app/ui/create-board-form";
import { CreatePostForm } from "@/app/ui/create-post-form";
import { OrgSwitcher } from "@/app/ui/org-switcher";
import { PlanBadge } from "@/app/ui/plan-badge";
import { requireActiveOrg, withCurrentTenant, type OrgSummary } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/plans";

// Always resolve the session and tenant-scoped data at request time.
export const dynamic = "force-dynamic";

type PostView = { id: string; content: string };
type BoardView = { id: string; name: string; postCount: number; posts: PostView[] };
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
        <TopBar orgs={orgs} activeOrgId={null} plan="FREE" />
        <p className="mt-10 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Your account doesn&apos;t belong to any organization yet.
        </p>
      </main>
    );
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)!;

  // Tenant-scoped read: no `where: { organizationId }` anywhere — Postgres RLS
  // scopes everything to the active org via `app.current_tenant`.
  const { plan, boards, members } = await withCurrentTenant(async (tx) => {
    const [org, boardRows, membershipRows] = await Promise.all([
      tx.organization.findFirstOrThrow({ select: { plan: true } }),
      tx.board.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { posts: true } },
          posts: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, content: true },
          },
        },
      }),
      tx.membership.findMany({
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: { role: true, user: { select: { name: true, email: true } } },
      }),
    ]);
    return {
      plan: org.plan,
      boards: boardRows.map<BoardView>((b) => ({
        id: b.id,
        name: b.name,
        postCount: b._count.posts,
        posts: b.posts,
      })),
      members: membershipRows.map<MemberView>((m) => ({
        role: m.role,
        name: m.user.name,
        email: m.user.email,
      })),
    };
  });

  const boardLimit = PLAN_LIMITS[plan].maxBoards;
  const postLimit = PLAN_LIMITS[plan].maxPostsPerBoard;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <TopBar orgs={orgs} activeOrgId={activeOrgId} plan={plan} />

      <header className="mt-8 mb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{activeOrg.name}</h1>
          <span className="font-mono text-xs text-slate-400">
            /{activeOrg.slug}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          You are <RoleBadge role={role!} /> here, on the <PlanBadge plan={plan} />{" "}
          plan.{" "}
          {plan === "FREE" ? (
            <>
              Limits: {boardLimit} board{boardLimit === 1 ? "" : "s"},{" "}
              {postLimit} posts per board.{" "}
              <Link href="/billing" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Upgrade to Pro
              </Link>{" "}
              for unlimited.
            </>
          ) : (
            <>Unlimited boards and posts.</>
          )}
        </p>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Boards ({boards.length})
          </h2>
        </div>
        <CreateBoardForm />

        <div className="mt-4 space-y-3">
          {boards.map((board) => (
            <div
              key={board.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">
                  <span className="text-slate-400">#</span> {board.name}
                </h3>
                <span className="text-xs text-slate-400">
                  {board.postCount} post{board.postCount === 1 ? "" : "s"}
                </span>
              </div>
              {board.posts.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {board.posts.map((post) => (
                    <li
                      key={post.id}
                      className="truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
                    >
                      {post.content}
                    </li>
                  ))}
                </ul>
              )}
              <CreatePostForm boardId={board.id} />
            </div>
          ))}
          {boards.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No boards yet — add one above.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Members ({members.length})
        </h2>
        <ul className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
      </section>
    </main>
  );
}

function TopBar({
  orgs,
  activeOrgId,
  plan,
}: {
  orgs: OrgSummary[];
  activeOrgId: string | null;
  plan: Plan;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
      <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/billing"
          className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Billing <PlanBadge plan={plan} />
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
