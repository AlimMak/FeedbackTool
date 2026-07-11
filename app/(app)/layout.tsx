import type { Plan } from "@prisma/client";

import { Sidebar } from "@/app/ui/sidebar";
import { getSession, requireActiveOrg, withCurrentTenant } from "@/lib/dal";

// The authenticated app shell: sidebar + scrollable main. Always request-time
// (session + tenant data).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeOrgId, orgs } = await requireActiveOrg();
  const session = await getSession();
  const userName = session?.user?.name ?? "You";
  const userEmail = session?.user?.email ?? "";

  let boards: ReadonlyArray<{ id: string; name: string }> = [];
  let plan: Plan = "FREE";
  if (activeOrgId) {
    const data = await withCurrentTenant(async (tx) => {
      const [boardRows, org] = await Promise.all([
        tx.board.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        }),
        tx.organization.findFirstOrThrow({ select: { plan: true } }),
      ]);
      return { boards: boardRows, plan: org.plan };
    });
    boards = data.boards;
    plan = data.plan;
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;

  return (
    <div className="flex h-screen">
      <Sidebar
        orgs={orgs}
        activeOrgId={activeOrgId}
        activeOrgName={activeOrg?.name ?? "No organization"}
        boards={boards}
        plan={plan}
        userName={userName}
        userEmail={userEmail}
      />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
