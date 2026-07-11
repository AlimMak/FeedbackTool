"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchOrganization } from "@/app/actions/org";
import type { OrgSummary } from "@/lib/dal";

/**
 * Client-side organization switcher. Invokes the `switchOrganization` server
 * action (which re-verifies membership and rewrites the JWT's active org), then
 * refreshes the router so the dashboard re-renders under the new tenant.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgSummary[];
  activeOrgId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (orgs.length <= 1) return null;

  function select(orgId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("orgId", orgId);
      await switchOrganization(formData);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Organization
      </span>
      {orgs.map((org) => {
        const isActive = org.id === activeOrgId;
        return (
          <button
            key={org.id}
            type="button"
            onClick={() => select(org.id)}
            disabled={isActive || pending}
            aria-current={isActive}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-default ${
              isActive
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {org.name}
          </button>
        );
      })}
    </div>
  );
}
