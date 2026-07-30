"use client";

import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { MailPayload } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// The latest messages, subject plus sender. Unread rows are bolder and carry a
// dot — the same "unread is heavier" convention the mail list uses.
export function MailWidget({ data }: { data: MailPayload }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  if (data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("mail.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {data.items.map((item) => (
        <li key={item.id} className="flex min-w-0 items-start gap-1.5 text-xs">
          {!item.isRead && (
            <Icon
              name="ri-circle-fill"
              aria-hidden
              className="mt-1 shrink-0 text-[0.5rem] text-primary-500"
            />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate",
                item.isRead
                  ? "text-foreground-700"
                  : "font-medium text-foreground-900",
              )}
            >
              {item.subject.trim() || t("mail.noSubject")}
            </span>
            <span className="block truncate text-muted-foreground">
              {item.fromName?.trim() || item.from}
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            {relativeTime(item.receivedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
