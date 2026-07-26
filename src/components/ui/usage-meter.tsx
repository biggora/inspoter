import { cn } from "@/lib/utils";

// Segmented utilisation meter for a bounded resource — CPU, memory, disk, a
// hosting quota (design.md §2.5).
//
// It speaks the segmented-strip language the product already uses for service
// heartbeats (services-view.tsx, service-detail-view.tsx): flex cells with a
// 2px step and a 2px radius, terracotta against teal. Only the height differs,
// because a heartbeat is a block of its own while this sits inside a dense
// metric row.
//
// Both halves of the ratio are coloured: taken is terracotta, free is teal. A
// meter that leaves the free part in the card's own background reads as a bar
// that simply stops, which answers "how much is used" but never "how much is
// left". There are no severity thresholds here — the meter states capacity,
// and a nearly full disk is reported by the number beside it, not by a colour
// change that would make every card shout.
//
// The meter is decorative: every caller prints the same figure as text next to
// it, so the value is announced once and colour is never its only carrier.

const DEFAULT_SEGMENTS = 20;

export function UsageMeter({
  value,
  segments = DEFAULT_SEGMENTS,
  className,
}: {
  // Percentage 0–100; values outside the range are clamped.
  value: number;
  segments?: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  // Rounding must not swallow the two states an operator reacts to: any load
  // at all lights a cell, and a resource with room left keeps one free.
  let used = Math.round((clamped / 100) * segments);
  if (clamped > 0) used = Math.max(1, used);
  if (clamped < 100) used = Math.min(segments - 1, used);

  return (
    <span
      data-slot="usage-meter"
      data-value={clamped}
      aria-hidden="true"
      className={cn("flex h-2 items-center gap-0.5", className)}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-full min-w-0 flex-1 rounded-[2px]",
            index < used ? "bg-primary-500" : "bg-accent-500",
          )}
        />
      ))}
    </span>
  );
}
