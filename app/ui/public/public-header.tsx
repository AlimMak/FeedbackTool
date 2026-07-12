import Link from "next/link";

import { Avatar } from "../avatar";

/** Public board identity row: org "logo" (initials) + name, optional back link. */
export function PublicHeader({
  orgName,
  backHref,
}: {
  orgName: string;
  backHref?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b-[0.5px] border-border pb-4">
      <div className="flex items-center gap-2">
        <Avatar name={orgName} className="h-6 w-6 text-[11px]" />
        <span className="text-sm font-medium">{orgName}</span>
      </div>
      {backHref && (
        <Link
          href={backHref}
          className="text-xs text-muted hover:text-foreground"
        >
          ← All posts
        </Link>
      )}
    </header>
  );
}
