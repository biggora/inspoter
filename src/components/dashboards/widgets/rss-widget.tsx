"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { RssFeedSnapshot } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// The latest items of one RSS or Atom feed. The server returns plain text only
// (HTML is stripped there), so every field is rendered as text — a feed is
// third-party content and never reaches the DOM as markup. An item without a
// link is shown as plain text instead of a dead anchor.

const ROW_CLASSES =
  "flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 -mx-1 text-xs no-underline transition-colors";
const LINK_CLASSES =
  "hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2";

export function RssWidget({ data }: { data: RssFeedSnapshot | null }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  // No feed address yet — say what to do rather than showing an error.
  if (data === null) {
    return (
      <p className="text-xs text-muted-foreground">{t("rss.notConfigured")}</p>
    );
  }

  if (data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("rss.empty")}</p>;
  }

  const hidden = data.totalCount - data.items.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {data.items.map((item, index) => {
          const content = (
            <>
              <span className="line-clamp-2 font-medium text-foreground-900">
                {item.title}
              </span>
              {item.publishedAt && (
                <span className="text-muted-foreground">
                  {relativeTime(item.publishedAt)}
                </span>
              )}
              {item.summary && (
                <span className="line-clamp-2 text-muted-foreground">
                  {item.summary}
                </span>
              )}
            </>
          );
          return (
            <li key={`${index}-${item.url ?? item.title}`}>
              {item.url ? (
                <Link
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ROW_CLASSES} ${LINK_CLASSES}`}
                >
                  {content}
                </Link>
              ) : (
                <div className={ROW_CLASSES}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("rss.moreCount", { count: hidden })}
        </p>
      )}
      {data.siteUrl && (
        <Link
          href={data.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate rounded-md text-xs text-muted-foreground hover:text-foreground-900 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          {data.feedTitle || t("rss.openFeed")}
        </Link>
      )}
    </div>
  );
}
