"use client";

import {
  StatusIndicator,
  type StatusState,
} from "@/components/ui/status-indicator";
import type { ServiceStatusValue } from "./api";

const STATUS_STATE: Record<ServiceStatusValue, StatusState> = {
  PENDING: "pending",
  UP: "up",
  DOWN: "down",
};

export function ServiceStatusBadge({
  status,
  pulse,
  className,
}: {
  status: ServiceStatusValue;
  // The check-history table passes false: those rows report past results.
  pulse?: false;
  className?: string;
}) {
  return (
    <StatusIndicator
      status={STATUS_STATE[status] ?? "pending"}
      pulse={pulse}
      className={className}
    />
  );
}
