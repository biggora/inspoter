import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Shared 4-tier severity scale (design.md §2.5) — unmapped severity strings
// fall back to the muted tier rather than guessing. `critical` is the only
// tier rendered as a solid filled badge.
const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-(--info-bg) text-(--info-text)",
  warning: "bg-(--warning-bg) text-(--warning-text)",
  error: "bg-(--error-bg) text-(--error-text)",
  critical: "bg-[#DC2626] text-white",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const style = SEVERITY_STYLES[normalized] ?? "bg-muted text-muted-foreground";
  return <Badge className={cn("uppercase", style)}>{severity}</Badge>;
}
