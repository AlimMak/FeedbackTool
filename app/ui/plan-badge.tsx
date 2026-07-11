import type { Plan } from "@prisma/client";

export function PlanBadge({ plan }: { plan: Plan }) {
  const styles =
    plan === "PRO"
      ? "bg-blue-600 text-white"
      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${styles}`}
    >
      {plan}
    </span>
  );
}
