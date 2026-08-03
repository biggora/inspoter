"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { MessagesPayload } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// The latest messages of the channels this tile watches. Each row names its
// channel (and category, since two categories may hold a channel of the same
// name) and links into the Messages section with that channel selected, so a
// tile aggregating several channels stays navigable.
//
// Unread rows are bolder and carry a dot — the same convention the mail widget
// and the channel sidebar use.
export function MessagesWidget({ data }: { data: MessagesPayload }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  if (data.items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("messages.empty")}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {data.items.map((item) => (
        <li key={item.id}>
          <Link
            href={{ pathname: "/messages", query: { channel: item.channelId } }}
            className="flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 -mx-1 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  item.isRead
                    ? "text-foreground-700"
                    : "font-medium text-foreground-900",
                )}
              >
                {item.channelName}
                {item.categoryName && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {item.categoryName}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                {relativeTime(item.createdAt)}
                {!item.isRead && (
                  <Icon
                    name="ri-circle-fill"
                    aria-hidden
                    className="text-[0.5rem] text-primary-500"
                  />
                )}
              </span>
            </span>
            <span className="line-clamp-2 text-muted-foreground">
              <span className="text-foreground-700">
                {item.author?.trim() || t("messages.unknownAuthor")}
              </span>
              {": "}
              {item.content || t("messages.noContent")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
