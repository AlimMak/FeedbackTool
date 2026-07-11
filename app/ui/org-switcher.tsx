"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { switchOrganization } from "@/app/actions/org";
import type { OrgSummary } from "@/lib/dal";
import { Avatar } from "./avatar";
import { ChevronDownIcon } from "./icons";

/**
 * Active-org display + dropdown to switch. Reuses the existing
 * `switchOrganization` action (which re-verifies membership and rewrites the
 * JWT active org); on switch we navigate to `/` so the new org's first board
 * loads.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
  activeOrgName,
}: {
  orgs: OrgSummary[];
  activeOrgId: string | null;
  activeOrgName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const others = orgs.filter((o) => o.id !== activeOrgId);

  function select(orgId: string) {
    setOpen(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("orgId", orgId);
      await switchOrganization(fd);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
      >
        <Avatar name={activeOrgName} className="h-6 w-6 text-[11px]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {activeOrgName}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border-[0.5px] border-border bg-surface p-1"
          >
            {others.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted">
                No other organizations
              </p>
            ) : (
              others.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => select(o.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <Avatar name={o.name} className="h-5 w-5 text-[10px]" />
                  <span className="truncate">{o.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
