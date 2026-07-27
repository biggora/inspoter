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
  isActive = true,
  pulse,
  className,
}: {
  status: ServiceStatusValue;
  // A paused service reports "suspended" instead of its last known result:
  // currentStatus stops being refreshed while the scheduler skips it, so a
  // green "Работает" would keep asserting something nobody is checking.
  isActive?: boolean;
  // The check-history table passes false: those rows report past results.
  pulse?: false;
  className?: string;
}) {
  return (
    <StatusIndicator
      status={isActive ? (STATUS_STATE[status] ?? "pending") : "suspended"}
      pulse={pulse}
      className={className}
    />
  );
}
