"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { Bookmark } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { BookmarkIcon } from "./bookmark-icon";

interface BookmarkCardProps {
  bookmark: Bookmark;
  dragDisabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function BookmarkCard({
  bookmark,
  dragDisabled,
  onEdit,
  onDelete,
}: BookmarkCardProps) {
  const t = useTranslations("bookmarks");
  // Bookmark-level sortable — reorder ownership (`onDragEnd`) lives in
  // bookmarks-board.tsx; this component only registers as a sortable item.
  // `disabled: dragDisabled` (true while a search query is active) makes
  // dnd-kit drop both `attributes["aria-disabled"]` and `listeners`, so the
  // handle below becomes inert by pointer AND keyboard automatically.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: bookmark.id,
    data: { type: "bookmark", categoryId: bookmark.categoryId },
    disabled: dragDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      aria-label={bookmark.name}
      className={cn(
        "group relative flex items-start gap-3 rounded-lg border border-background-200 bg-background-50 p-3 text-sm transition-colors hover:border-background-300",
        isDragging && "opacity-60",
      )}
    >
      <Link
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={bookmark.name}
        className="flex min-h-[var(--control-sm)] min-w-0 flex-1 items-start gap-3 no-underline"
      >
        <BookmarkIcon
          icon={bookmark.icon}
          name={bookmark.name}
          color={bookmark.color}
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground-900 transition-colors hover:text-primary-600">
            {bookmark.name}
          </span>
          {bookmark.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-foreground-500">
              {bookmark.description}
            </p>
          ) : null}
          <p
            className="mt-1 truncate text-xs text-foreground-400"
            title={bookmark.url}
            dir="ltr"
          >
            {bookmark.url}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Drag handle: an independent focus stop — separate from
            the card link above and the DropdownMenuTrigger below
            (design.md §5.1 a11y rule). Opacity mirrors the menu trigger's
            existing reveal-on-hover pattern, but keyboard focus always
            reveals it (opacity ≠ visibility for a11y). */}
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          aria-label={t("bookmarkDragHandleLabel", { name: bookmark.name })}
          className={cn(
            "touch-none opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
            dragDisabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          <Icon name="ri-draggable" aria-hidden data-icon="inline-start" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100"
              />
            }
            aria-label={t("bookmarkActionsLabel", { name: bookmark.name })}
          >
            <Icon name="ri-more-2-line" aria-hidden data-icon="inline-start" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                {t("editAction")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                {t("deleteAction")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
