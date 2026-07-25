import {
  StatusIndicator,
  type StatusIndicatorVariant,
} from "@/components/ui/status-indicator";

// Shared 4-tier severity scale (design.md §2.5) — unmapped severity strings
// fall back to the muted tier rather than guessing. `critical` uses a
// separate, stronger semantic red rather than the ordinary error style.
// A severity classifies a past event, so it never pulses.
const SEVERITY_VARIANTS: Record<string, StatusIndicatorVariant> = {
  info: "info",
  warning: "warning",
  error: "error",
  critical: "critical",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  return (
    <StatusIndicator
      variant={SEVERITY_VARIANTS[normalized] ?? "secondary"}
      label={severity}
      className="uppercase"
    />
  );
}
