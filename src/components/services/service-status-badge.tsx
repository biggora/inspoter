"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ServiceStatusValue } from "./api";

const STATUS_CONFIG: Record<
  ServiceStatusValue,
  { labelKey: string; variant: "secondary" | "success" | "critical" }
> = {
  PENDING: {
    labelKey: "statusPending",
    variant: "secondary",
  },
  UP: {
    labelKey: "statusUp",
    variant: "success",
  },
  DOWN: {
    labelKey: "statusDown",
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
  const t = useTranslations("services");
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <Badge variant={config.variant} className={className}>
      <span
        className="size-1.5 shrink-0 rounded-full bg-current"
        aria-hidden="true"
      />
      {t(config.labelKey)}
    </Badge>
  );
}
