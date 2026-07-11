import Link from "next/link";
import type { Plan } from "@prisma/client";

import { Avatar } from "./avatar";
import { PlanBadge } from "./plan-badge";

export function SidebarFooter({
  userName,
  userEmail,
  plan,
}: {
  userName: string;
  userEmail: string;
  plan: Plan;
}) {
  return (
    <div className="border-t-[0.5px] border-border p-3">
      <div className="flex items-center gap-2">
        <Avatar name={userName} className="h-7 w-7 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{userName}</p>
          {userEmail && (
            <p className="truncate text-xs text-muted">{userEmail}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PlanBadge plan={plan} />
        {plan === "FREE" && (
          <Link
            href="/billing"
            className="text-xs font-medium text-accent hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
