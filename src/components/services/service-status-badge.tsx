"use client";

import { useTranslations } from "next-intl";
import {
  StatusIndicator,
  type StatusIndicatorVariant,
} from "@/components/ui/status-indicator";
import type { ServiceStatusValue } from "./api";

const STATUS_CONFIG: Record<
  ServiceStatusValue,
  { labelKey: string; variant: StatusIndicatorVariant; pulse: boolean }
> = {
  PENDING: {
    labelKey: "statusPending",
    variant: "secondary",
    pulse: false,
  },
  UP: {
    labelKey: "statusUp",
    variant: "success",
    pulse: true,
  },
  DOWN: {
    labelKey: "statusDown",
    variant: "critical",
    pulse: false,
  },
};

export function ServiceStatusBadge({
  status,
  pulse,
  className,
}: {
  status: ServiceStatusValue;
  // Historical check rows pass false: they report a past result, not a live state.
  pulse?: boolean;
  className?: string;
}) {
  const t = useTranslations("services");
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <StatusIndicator
      variant={config.variant}
      label={t(config.labelKey)}
      pulse={pulse ?? config.pulse}
      className={className}
    />
  );
}
