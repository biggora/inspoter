import { Badge } from "@/components/ui/badge";
import type { ServiceStatusValue } from "./api";

const STATUS_CONFIG: Record<
  ServiceStatusValue,
  { label: string; variant: "secondary" | "success" | "critical" }
> = {
  PENDING: {
    label: "Ожидание",
    variant: "secondary",
  },
  UP: {
    label: "Работает",
    variant: "success",
  },
  DOWN: {
    label: "Недоступен",
    variant: "critical",
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
    <Badge variant={config.variant} className={className}>
      <span
        className="size-1.5 shrink-0 rounded-full bg-current"
        aria-hidden="true"
      />
      {config.label}
    </Badge>
  );
}
