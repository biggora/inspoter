"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { useIndicators } from "./indicator-store-provider";
import type { IndicatorStateDto } from "./indicator-store";

// Above this the exact number stops carrying information and starts breaking
// the layout of a badge sitting on a 28px button.
const MAX_DISPLAYED_COUNT = 99;

interface IndicatorDefinition {
  /** Matches the Workspace.hiddenSections key in nav-items.ts. */
  key: keyof IndicatorStateDto;
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
  /** Workspace.hiddenSections — a hidden section gets no shortcut. */
  hiddenSections: string[];
}

// Counts come from the shared indicator store, which owns the one SSE
// connection and the one safety poll for the whole shell
// (indicator-store-provider.tsx). This component used to run its own timer,
// its own navigation refetch and its own window-event listener — none of which
// the sidebar footer beside it could see, which is how the two ended up
// disagreeing.
export function NotificationIndicators({
  hiddenSections,
}: NotificationIndicatorsProps) {
  const t = useTranslations("shell");
  const counts = useIndicators();

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
                className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 px-1 text-2xs tabular-nums"
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
