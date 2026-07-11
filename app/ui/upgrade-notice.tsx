import Link from "next/link";

/** Inline plan-limit prompt shown when a FREE org hits a limit in a dialog. */
export function UpgradeNotice({ message }: { message: string }) {
  return (
    <div className="rounded-md border-[0.5px] border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
      <p>{message}</p>
      <Link
        href="/billing"
        className="mt-1 inline-block font-medium text-accent hover:underline"
      >
        Upgrade to Pro →
      </Link>
    </div>
  );
}
