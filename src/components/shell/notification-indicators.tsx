"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Link, usePathname } from "@/i18n/navigation";
import {
  fetchUnreadCounts,
  UNREAD_COUNTS_STALE_EVENT,
  type UnreadCountsDto,
} from "./notifications-api";

// Same cadence as the dashboard's widget refresh (dashboard-view.tsx): current
// enough for an operator watching the screen, cheap enough to leave running.
const REFRESH_INTERVAL_MS = 60_000;

// Above this the exact number stops carrying information and starts breaking
// the layout of a badge sitting on a 28px button.
const MAX_DISPLAYED_COUNT = 99;

interface IndicatorDefinition {
  /** Matches the Workspace.hiddenSections key in nav-items.ts. */
  key: keyof UnreadCountsDto;
  href: string;
  icon: string;
  labelKey: string;
}

// Icons and hrefs deliberately mirror SECTION_NAV_ITEMS in nav-items.ts — the
// topbar shortcut and the sidebar entry must read as the same destination.
const INDICATORS: IndicatorDefinition[] = [
  {
    key: "calendar",
    href: "/calendar?inbox=due",
    icon: "ri-calendar-check-line",
    labelKey: "notificationsCalendarLabel",
  },
  {
    key: "mail",
    href: "/mail",
    icon: "ri-mail-line",
    labelKey: "notificationsMailLabel",
  },
  {
    key: "alerts",
    href: "/alerts",
    icon: "ri-alert-line",
    labelKey: "notificationsAlertsLabel",
  },
  {
    key: "messages",
    href: "/messages",
    icon: "ri-message-2-line",
    labelKey: "notificationsMessagesLabel",
  },
];

export interface NotificationIndicatorsProps {
  /**
   * Server-rendered counts from the dashboard layout, so the badges are
   * correct on first paint instead of popping in after the first poll.
   */
  initialCounts: UnreadCountsDto;
  /** Workspace.hiddenSections — a hidden section gets no shortcut. */
  hiddenSections: string[];
}

export function NotificationIndicators({
  initialCounts,
  hiddenSections,
}: NotificationIndicatorsProps) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const [counts, setCounts] = useState(initialCounts);

  // Three triggers, one loader:
  //  - the timer, paused on a backgrounded tab;
  //  - navigation, so leaving a section reflects what was read inside it
  //    (mail marks items read from its reading pane, with no explicit signal);
  //  - the stale event, fired by the sections that mark rows read on entry —
  //    the navigation refetch alone would race that write and lose.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;

    async function refresh() {
      try {
        const next = await fetchUnreadCounts();
        if (!cancelled) setCounts(next);
      } catch {
        // A failed poll keeps the last known numbers; the next tick retries.
      }
    }

    void refresh();

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener(UNREAD_COUNTS_STALE_EVENT, refresh);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(UNREAD_COUNTS_STALE_EVENT, refresh);
    };
  }, [pathname]);

  const visible = INDICATORS.filter(
    (indicator) => !hiddenSections.includes(indicator.key),
  );
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((indicator) => {
        const count = counts[indicator.key];
        return (
          <span key={indicator.href} className="relative inline-flex">
            <Button
              render={<Link href={indicator.href} />}
              nativeButton={false}
              variant="ghost"
              size="icon-sm"
              aria-label={t(indicator.labelKey, { count })}
            >
              <Icon name={indicator.icon} aria-hidden />
            </Button>
            {count > 0 && (
              <Badge
                aria-hidden
                className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[0.625rem] tabular-nums"
              >
                {count > MAX_DISPLAYED_COUNT
                  ? `${MAX_DISPLAYED_COUNT}+`
                  : count}
              </Badge>
            )}
          </span>
        );
      })}
    </>
  );
}
