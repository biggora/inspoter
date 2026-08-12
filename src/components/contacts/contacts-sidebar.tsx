"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { labelColorToHex, type LabelColor } from "@/lib/label-color";
import { cn } from "@/lib/utils";
import type { ContactLabelSummary } from "./api";
import type { ContactsFilters } from "./contacts-view";

// Google Contacts' left rail: the two standing views, the workspace's labels,
// and the duplicates screen. Every entry is a real link, so the browser can
// bookmark and go back through them. Under lg it becomes a horizontal
// scroller rather than disappearing behind a menu.
export function ContactsSidebar({
  labels,
  filters,
  onManageLabels,
}: {
  labels: ContactLabelSummary[];
  filters: ContactsFilters;
  onManageLabels: () => void;
}) {
  const t = useTranslations("contacts");
  const isAll = !filters.starred && filters.labelId === null;

  return (
    <aside className="lg:w-56 lg:shrink-0">
      <nav
        aria-label={t("pageTitle")}
        className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        <SidebarLink
          href="/contacts"
          icon="ri-contacts-book-line"
          label={t("sidebarAll")}
          active={isAll}
        />
        <SidebarLink
          href="/contacts?starred=true"
          icon="ri-star-line"
          label={t("sidebarStarred")}
          active={filters.starred}
        />
        <SidebarLink
          href="/contacts/duplicates"
          icon="ri-git-merge-line"
          label={t("sidebarDuplicates")}
          active={false}
        />
      </nav>

      <div className="mt-4 hidden lg:block">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("sidebarLabels")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("manageLabelsButton")}
            onClick={onManageLabels}
          >
            <Icon name="ri-settings-3-line" aria-hidden />
          </Button>
        </div>
        {labels.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {t("sidebarNoLabels")}
          </p>
        ) : (
          <nav aria-label={t("sidebarLabels")} className="mt-1 flex flex-col">
            {labels.map((label) => (
              <Link
                key={label.id}
                href={`/contacts?labelId=${encodeURIComponent(label.id)}`}
                className={linkClasses(filters.labelId === label.id)}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: labelColorToHex(label.color as LabelColor),
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                <span className="text-xs text-muted-foreground">
                  {label.contactCount}
                </span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Under lg the labels live behind the same dialog rather than eating
          vertical space above the table. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full lg:hidden"
        onClick={onManageLabels}
      >
        <Icon name="ri-price-tag-3-line" aria-hidden data-icon="inline-start" />
        {t("manageLabelsButton")}
      </Button>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={linkClasses(active)}>
      <Icon name={icon} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function linkClasses(active: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
    active
      ? "bg-background-100 font-medium text-foreground"
      : "text-muted-foreground hover:bg-background-50 hover:text-foreground",
  );
}
