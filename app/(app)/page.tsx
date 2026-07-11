import { redirect } from "next/navigation";

import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";

export const dynamic = "force-dynamic";

// The dashboard root sends you to your first board, or shows an empty state.
export default async function AppHome() {
  const { activeOrgId } = await requireActiveOrg();

  if (!activeOrgId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="rounded-card border-[0.5px] border-dashed border-border px-6 py-10 text-center text-sm text-muted">
          Your account doesn&apos;t belong to any organization yet.
        </p>
      </div>
    );
  }

  const first = await withCurrentTenant((tx) =>
    tx.board.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  );

  if (first) redirect(`/boards/${first.id}`);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="rounded-card border-[0.5px] border-dashed border-border px-6 py-10 text-center text-sm text-muted">
        No boards yet — create one from the sidebar.
      </p>
    </div>
  );
}
