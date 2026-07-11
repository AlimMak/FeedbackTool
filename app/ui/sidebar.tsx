import type { Plan } from "@prisma/client";

import type { OrgSummary } from "@/lib/dal";
import { BoardList } from "./board-list";
import { OrgSwitcher } from "./org-switcher";
import { SidebarFooter } from "./sidebar-footer";

/**
 * The authenticated app shell's left sidebar (~210px): org switcher on top,
 * this org's boards in the middle, current user + plan at the bottom.
 */
export function Sidebar({
  orgs,
  activeOrgId,
  activeOrgName,
  boards,
  plan,
  userName,
  userEmail,
}: {
  orgs: OrgSummary[];
  activeOrgId: string | null;
  activeOrgName: string;
  boards: ReadonlyArray<{ id: string; name: string }>;
  plan: Plan;
  userName: string;
  userEmail: string;
}) {
  return (
    <aside className="flex h-full w-[210px] shrink-0 flex-col border-r-[0.5px] border-border bg-surface">
      <div className="p-2">
        <OrgSwitcher
          orgs={orgs}
          activeOrgId={activeOrgId}
          activeOrgName={activeOrgName}
        />
      </div>
      <nav className="flex-1 overflow-y-auto px-2">
        <BoardList boards={boards} />
      </nav>
      <SidebarFooter userName={userName} userEmail={userEmail} plan={plan} />
    </aside>
  );
}
