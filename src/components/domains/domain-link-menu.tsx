"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { LinkedState, LinkTarget } from "./link-targets";

interface DomainLinkMenuProps {
  target: LinkTarget;
  linked: LinkedState;
  /** False when the workspace has no bookmark category to file into yet. */
  hasCategories: boolean;
  onAddBookmark: () => void;
  onAddMonitor: () => void;
}

// Row-level "add this domain/record to Bookmarks or Monitoring" menu, shared
// by the domain list and the DNS records drill-in. Trigger styling mirrors
// src/components/bookmarks/bookmark-card.tsx.
export function DomainLinkMenu({
  target,
  linked,
  hasCategories,
  onAddBookmark,
  onAddMonitor,
}: DomainLinkMenuProps) {
  const t = useTranslations("domains");

  if (!target.bookmark && !target.monitor) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" />}
        aria-label={t("linkActionsLabel", { name: target.label })}
      >
        <Icon name="ri-more-2-line" aria-hidden data-icon="inline-start" />
      </DropdownMenuTrigger>
      {/* The trigger is an icon button, so the default anchor-width popup would
          wrap every label onto two lines — size to the content instead. */}
      <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
        <DropdownMenuGroup>
          {target.bookmark ? (
            linked.bookmarkId ? (
              <DropdownMenuItem render={<Link href="/bookmarks" />}>
                <Icon name="ri-bookmark-line" aria-hidden />
                {t("openInBookmarksAction")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={!hasCategories}
                onClick={onAddBookmark}
              >
                <Icon name="ri-bookmark-line" aria-hidden />
                {hasCategories
                  ? t("addToBookmarksAction")
                  : t("noCategoriesHint")}
              </DropdownMenuItem>
            )
          ) : null}

          {target.monitor ? (
            linked.serviceId ? (
              <DropdownMenuItem
                render={<Link href={`/services/${linked.serviceId}`} />}
              >
                <Icon name="ri-pulse-line" aria-hidden />
                {t("openInMonitoringAction")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onAddMonitor}>
                <Icon name="ri-pulse-line" aria-hidden />
                {t("addToMonitoringAction")}
              </DropdownMenuItem>
            )
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Inline "already linked" markers, rendered next to the domain / record name
// so the state is visible without opening the menu.
export function LinkedBadges({ linked }: { linked: LinkedState }) {
  const t = useTranslations("domains");

  if (!linked.bookmarkId && !linked.serviceId) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {linked.bookmarkId && (
        <Badge variant="outline">
          <Icon name="ri-bookmark-line" aria-hidden data-icon="inline-start" />
          {t("bookmarkedBadge")}
        </Badge>
      )}
      {linked.serviceId && (
        <Badge variant="outline">
          <Icon name="ri-pulse-line" aria-hidden data-icon="inline-start" />
          {t("monitoredBadge")}
        </Badge>
      )}
    </span>
  );
}
