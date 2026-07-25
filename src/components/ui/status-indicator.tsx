"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The one status indicator for the whole app (design.md §2.5). Every surface
// that reports the state of something — cards, tables, dialogs, the mail
// sidebar — renders this instead of rebuilding badge-plus-dot markup.
//
// A caller passes the canonical state, never a colour or a wording of its own:
// colour, pulse, and the visible label all come from here, so the same state
// can never be spelled "Up" on one screen and "Running" or "Active" on the
// next. Domain enums (service UP, server running, hosting active, token not
// revoked…) are mapped to a canonical state at the call site.
export type StatusState =
  | "up"
  | "down"
  | "stopped"
  | "suspended"
  | "disabled"
  | "revoked"
  | "pending"
  | "starting"
  | "stopping"
  | "restarting"
  | "syncing"
  | "inProgress"
  | "completed"
  | "error"
  | "stale"
  | "notConfigured"
  | "notChecked"
  | "unknown"
  | "system";

export type StatusIndicatorVariant =
  | "success"
  | "warning"
  | "critical"
  | "error"
  | "info"
  | "secondary"
  | "outline";

// `pulse` marks the states that are live or still moving. Settled states stay
// static so the animation keeps meaning something.
const STATE_CONFIG: Record<
  StatusState,
  { variant: StatusIndicatorVariant; pulse: boolean }
> = {
  up: { variant: "success", pulse: true },
  down: { variant: "critical", pulse: false },
  stopped: { variant: "secondary", pulse: false },
  suspended: { variant: "warning", pulse: false },
  disabled: { variant: "secondary", pulse: false },
  revoked: { variant: "secondary", pulse: false },
  pending: { variant: "secondary", pulse: false },
  starting: { variant: "warning", pulse: true },
  stopping: { variant: "warning", pulse: true },
  restarting: { variant: "warning", pulse: true },
  syncing: { variant: "info", pulse: true },
  inProgress: { variant: "info", pulse: true },
  completed: { variant: "success", pulse: false },
  error: { variant: "error", pulse: false },
  stale: { variant: "warning", pulse: false },
  notConfigured: { variant: "secondary", pulse: false },
  notChecked: { variant: "outline", pulse: false },
  unknown: { variant: "secondary", pulse: false },
  system: { variant: "secondary", pulse: false },
};

// Dot on its own, for the few places with no room for a label. The colour is
// inherited from the parent's text colour via bg-current, so callers never
// hardcode a state colour. It is decorative: a label-less caller wraps it in a
// named element (role="img" + aria-label).
export function StatusDot({
  pulse = false,
  className,
}: {
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative flex size-1.5 shrink-0", className)}
      aria-hidden="true"
    >
      {pulse && (
        <span className="absolute inset-0 animate-status-ping rounded-full bg-current motion-reduce:animate-none" />
      )}
      <span className="relative size-1.5 rounded-full bg-current" />
    </span>
  );
}

type StatusIndicatorProps =
  | {
      // Canonical state: label, colour, and pulse are all derived. Use this
      // everywhere a state is shown.
      status: StatusState;
      variant?: never;
      label?: never;
      // Only ever passed as false, by surfaces that list historical records
      // (a past check result is not a live state).
      pulse?: false;
      className?: string;
    }
  | {
      // Escape hatch for scales that are not states and carry their own
      // wording — alert severity and log levels. Never pulses.
      status?: never;
      variant: StatusIndicatorVariant;
      label: string;
      pulse?: false;
      className?: string;
    };

// Dot plus its mandatory visible label — status is never colour-only
// (design.md §2.6). Reduced motion removes the halo.
export function StatusIndicator(props: StatusIndicatorProps) {
  const t = useTranslations("status");
  const { variant, label, pulse } = props.status
    ? {
        ...STATE_CONFIG[props.status],
        label: t(props.status),
        pulse: props.pulse === false ? false : STATE_CONFIG[props.status].pulse,
      }
    : { variant: props.variant, label: props.label, pulse: false };

  return (
    <Badge variant={variant} className={props.className}>
      <StatusDot pulse={pulse} />
      {label}
    </Badge>
  );
}
