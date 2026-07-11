import { PostStatus } from "@prisma/client";

/** Display order and per-status label + pill colors for roadmap statuses. */
export const STATUS_ORDER: readonly PostStatus[] = [
  PostStatus.OPEN,
  PostStatus.PLANNED,
  PostStatus.IN_PROGRESS,
  PostStatus.DONE,
];

export const STATUS_META: Record<
  PostStatus,
  { label: string; className: string }
> = {
  OPEN: {
    label: "Open",
    className: "bg-surface-2 text-muted",
  },
  PLANNED: {
    label: "Planned",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-accent-subtle text-accent",
  },
  DONE: {
    label: "Done",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
};

export function StatusPill({ status }: { status: PostStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
