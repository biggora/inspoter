import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceStatusValue } from "./api";

// Same color tokens as servers-view.tsx's statusConfig (accent = up/green,
// secondary = idle/gray, primary = down/red — see --status-ok/--status-idle/
// --status-danger in inspot-tokens.css), rendered through the shared Badge
// component per plan.md "Frontend".
const STATUS_CONFIG: Record<
  ServiceStatusValue,
  { label: string; className: string; dotClassName: string }
> = {
  PENDING: {
    label: "Ожидание",
    className: "bg-secondary-100 text-secondary-700",
    dotClassName: "bg-secondary-400",
  },
  UP: {
    label: "Работает",
    className: "bg-accent-100 text-accent-700",
    dotClassName: "bg-accent-500",
  },
  DOWN: {
    label: "Недоступен",
    className: "bg-primary-100 text-primary-700",
    dotClassName: "bg-primary-500",
  },
};

export function ServiceStatusBadge({
  status,
  className,
}: {
  status: ServiceStatusValue;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <Badge className={cn(config.className, className)}>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", config.dotClassName)}
        aria-hidden="true"
      />
      {config.label}
    </Badge>
  );
}
