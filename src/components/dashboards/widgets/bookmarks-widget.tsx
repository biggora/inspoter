"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import type { BookmarksPayload } from "@/lib/dashboards/widget-payloads";

// Link tiles, the way Homarr's "apps" read: glyph plus name, one click from the
// target. Absolute URLs pass through the localized Link untouched, which is how
// the Bookmarks section links out too (src/components/bookmarks/bookmark-card.tsx).
//
// The section's BookmarkIcon is not reused here: it is fixed at size-14 for the
// bookmark card, which is taller than a whole dashboard grid row. This glyph
// follows the same reference-value convention (emoji, Remix Icon class, or image
// URL) at tile scale, and never loads a remote image — a board full of external
// favicons would fetch from a dozen third-party hosts on every visit.

function BookmarkGlyph({ icon }: { icon: string | null }) {
  const trimmed = icon?.trim();
  if (!trimmed || /^(https?:)?\/\/|^\/|^data:/i.test(trimmed)) {
    return <Icon name="ri-links-line" aria-hidden className="shrink-0" />;
  }
  if (trimmed.startsWith("ri-")) {
    return <Icon name={trimmed} aria-hidden className="shrink-0" />;
  }
  return (
    <span aria-hidden="true" className="shrink-0 text-sm leading-none">
      {trimmed}
    </span>
  );
}

export function BookmarksWidget({ data }: { data: BookmarksPayload }) {
  const t = useTranslations("dashboards");

  if (data.bookmarks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("bookmarks.empty")}</p>
    );
  }

  const hidden = data.totalCount - data.bookmarks.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="grid grid-cols-1 gap-1.5 @[16rem]/widget:grid-cols-2">
        {data.bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="min-w-0">
            <Link
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              title={bookmark.url}
              className="flex items-center gap-2 rounded-md border border-[var(--border-default)] px-2 py-1.5 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
            >
              <BookmarkGlyph icon={bookmark.icon} />
              <span className="min-w-0 truncate">{bookmark.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("bookmarks.moreCount", { count: hidden })}
        </p>
      )}
    </div>
  );
}
