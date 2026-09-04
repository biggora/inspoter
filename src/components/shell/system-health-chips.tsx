"use client";

import { useTranslations } from "next-intl";

import { StatusIndicator } from "@/components/ui/status-indicator";
import { Link } from "@/i18n/navigation";
import { useIndicators } from "./indicator-store-provider";

// The one implementation of the "System status" block (design.md §3.2). The
// sidebar footer and the management page's operating picture both render this;
// they used to carry byte-identical copies of the ternaries below, fed by two
// independent server calls in different render passes, which is exactly how
// they ended up showing different numbers on the same screen.

export function SystemHealthChips({
  variant,
}: {
  /** Sidebar footer, or the panel inside the management operating picture.
   *  Layout only — the wording and colours are identical by construction. */
  variant: "sidebar" | "panel";
}) {
  const t = useTranslations("shell");
  const { providersOk, providersErrored, openCriticalAlerts } = useIndicators();

  const providersVariant =
    providersErrored > 0 ? "error" : providersOk > 0 ? "success" : "secondary";
  const providersLabel =
    providersErrored > 0
      ? t("statusProvidersErrors", { count: providersErrored })
      : providersOk > 0
        ? t("statusProvidersOk", { count: providersOk })
        : t("statusProvidersNone");

  // Classes carried over verbatim from the two call sites this replaces, so
  // neither surface changes visually.
  const rowClass =
    variant === "sidebar"
      ? "flex min-h-6 items-center rounded-md hover:bg-[var(--surface-hover)]"
      : "-mx-1.5 flex min-h-6 items-center rounded-md px-1.5 hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

  return (
    <ul
      className={
        variant === "sidebar"
          ? "flex flex-col gap-1 px-2 pb-2"
          : "flex flex-col gap-1 sm:flex-row sm:gap-6"
      }
    >
      <li>
        <Link href="/settings/providers" className={rowClass}>
          <StatusIndicator variant={providersVariant} label={providersLabel} />
        </Link>
      </li>
      <li>
        <Link href="/alerts" className={rowClass}>
          <StatusIndicator
            variant={openCriticalAlerts > 0 ? "critical" : "success"}
            label={
              openCriticalAlerts > 0
                ? t("statusCriticalAlertsOpen", { count: openCriticalAlerts })
                : t("statusCriticalAlertsNone")
            }
          />
        </Link>
      </li>
    </ul>
  );
}
