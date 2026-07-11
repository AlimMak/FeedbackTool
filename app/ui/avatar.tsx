/** Initials avatar. Size is controlled by the caller via `className`. */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?";

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-accent-subtle font-medium text-accent ${className ?? "h-6 w-6 text-[11px]"}`}
    >
      {initials}
    </span>
  );
}
