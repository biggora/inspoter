"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { DashboardWidgetKind } from "@/generated/prisma/client";
import { catalogEntry, WIDGET_SECTION_HREF } from "./widget-catalog";

// The chrome around every tile: a header with the title, the drag handle and the
// actions menu in edit mode, a link into the widget's section in view mode, and a
// scrollable body.
//
// The frame is identical for all ten widget kinds, which is what keeps the widget
// components themselves purely about their data.

interface DashboardWidgetFrameProps {
  kind: DashboardWidgetKind;
  /** Operator-supplied title; falls back to the kind's translated name. */
  title?: string;
  /** Built by the grid; null while the board is not in edit mode. */
  dragHandle: React.ReactNode;
  editing: boolean;
  onConfigure: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

export function DashboardWidgetFrame({
  kind,
  title,
  dragHandle,
  editing,
  onConfigure,
  onRemove,
  children,
}: DashboardWidgetFrameProps) {
  const t = useTranslations("dashboards");
  const entry = catalogEntry(kind);
  const resolvedTitle = title?.trim() || t(entry.titleKey);
  const sectionHref = WIDGET_SECTION_HREF[kind];

  return (
    <section
      data-slot="dashboard-widget"
      aria-label={resolvedTitle}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-[var(--border-default)] px-3 py-2">
        {dragHandle}
        <Icon
          name={entry.icon}
          className="shrink-0 text-muted-foreground"
          aria-hidden
        />
        <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-medium text-foreground-800">
          {resolvedTitle}
        </h2>
        {editing ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-xs" />}
              aria-label={t("widgetMenuLabel")}
            >
              <Icon name="ri-more-2-line" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onConfigure}>
                  {t("configureAction")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  {t("removeWidgetAction")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          sectionHref && (
            <Button
              render={<Link href={sectionHref} />}
              nativeButton={false}
              variant="ghost"
              size="icon-xs"
              aria-label={t("viewSectionLink")}
              className="shrink-0"
            >
              <Icon name="ri-arrow-right-up-line" aria-hidden />
            </Button>
          )
        )}
      </header>
      <div
        className={cn(
          // A container query context so a widget can adapt to its own tile
          // width: the same widget is 2 columns wide on one board and 8 on
          // another, and the viewport says nothing about which.
          "@container/widget min-h-0 flex-1 overflow-auto px-3 py-2.5",
          // In edit mode the body must not swallow the drag: a pointer press
          // anywhere on the tile should move it, not scroll or follow a link.
          editing && "pointer-events-none select-none",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * A widget whose server-side resolution failed. Rendered in place of the
 * widget's own body so one unreachable provider costs one tile, not the board.
 */
export function DashboardWidgetError({ message }: { message: string }) {
  const t = useTranslations("dashboards");
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-foreground-700">
        <Icon name="ri-error-warning-line" aria-hidden />
        {t("widgetErrorTitle")}
      </p>
      <p className="break-words text-muted-foreground">{message}</p>
    </div>
  );
}
