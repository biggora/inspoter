import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Shared 4-tier severity scale (design.md §2.5) — unmapped severity strings
// fall back to the muted tier rather than guessing. `critical` uses a
// separate, stronger semantic red rather than the ordinary error style.
const SEVERITY_STYLES: Record<string, string> = {
  info: "border-(--info-border) bg-(--info-bg) text-(--info-text)",
  warning: "border-(--warning-border) bg-(--warning-bg) text-(--warning-text)",
  error: "border-(--error-border) bg-(--error-bg) text-(--error-text)",
  critical:
    "border-(--critical-border) bg-(--critical-bg) text-(--critical-text)",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const style = SEVERITY_STYLES[normalized] ?? "bg-muted text-muted-foreground";
  return <Badge className={cn("uppercase", style)}>{severity}</Badge>;
}
