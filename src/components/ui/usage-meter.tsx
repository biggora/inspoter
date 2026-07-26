import { cn } from "@/lib/utils";

// Segmented utilisation meter for CPU/memory/disk load (design.md §2.5).
//
// It carries over the thresholds, height, and semantics of the design system's
// ProgressBar (specs/inspot-design/components/data-display/ProgressBar.jsx) but
// fills in discrete cells instead of a continuous bar, so "how much is taken"
// can be counted at a glance. Feature components render this instead of
// assembling their own bar, and they never pick the colour: the tone comes from
// the value through the shared semantic tokens.
//
// The meter is decorative. Every caller shows the same number as text beside
// it, so the value is never colour-only and assistive technology reads it once.

const SEGMENTS = 10;

function toneClass(value: number): string {
  if (value >= 85) return "bg-[var(--status-danger)]";
  if (value >= 60) return "bg-[var(--status-warn)]";
  return "bg-[var(--status-ok)]";
}

export function UsageMeter({
  value,
  className,
}: {
  // Percentage 0–100; values outside the range are clamped.
  value: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  // Any non-zero load lights at least one cell — a barely-used resource must
  // still read as used rather than as empty.
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round(clamped / 10));
  const fill = toneClass(clamped);

  return (
    <span
      data-slot="usage-meter"
      data-value={clamped}
      aria-hidden="true"
      className={cn("flex h-1.5 items-stretch gap-px", className)}
    >
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span
          key={index}
          className={cn(
            "flex-1 rounded-sm",
            index < filled ? fill : "bg-[var(--surface-sunken)]",
          )}
        />
      ))}
    </span>
  );
}
