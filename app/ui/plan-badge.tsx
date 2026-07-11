import type { Plan } from "@prisma/client";

/** Plan badge. Sentence case ("Free"/"Pro"), calm-accent fill for Pro. */
export function PlanBadge({ plan }: { plan: Plan }) {
  const label = plan === "PRO" ? "Pro" : "Free";
  const styles =
    plan === "PRO"
      ? "bg-accent text-accent-foreground"
      : "bg-surface-2 text-muted";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${styles}`}
    >
      {label}
    </span>
  );
}
