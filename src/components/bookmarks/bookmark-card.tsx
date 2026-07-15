"use client";

import { GripVertical, MoreVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  // Bookmark-level sortable — reorder ownership (`onDragEnd`) lives in
  // bookmarks-board.tsx; this component only registers as a sortable item.
  // `disabled: dragDisabled` (true while a search query is active) makes
  // dnd-kit drop both `attributes["aria-disabled"]` and `listeners`, so the
  // handle below becomes inert by pointer AND keyboard automatically.
  const {
    attributes,
    listeners,
    setNodeRef,
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
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        <BookmarkIcon
          icon={bookmark.icon}
          name={bookmark.name}
          color={bookmark.color}
        />
      </a>

      <div className="min-w-0 flex-1">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-medium text-sm text-foreground-900 no-underline transition-colors hover:text-primary-600"
        >
          {bookmark.name}
        </a>
        {bookmark.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-foreground-500">
            {bookmark.description}
          </p>
        ) : null}
        <p className="mt-1 truncate text-xs text-foreground-400">
          {bookmark.url}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Drag handle: a third, independent focus stop — separate from
            the two card links above and the DropdownMenuTrigger below
            (design.md §5.1 a11y rule). Opacity mirrors the menu trigger's
            existing reveal-on-hover pattern, but keyboard focus always
            reveals it (opacity ≠ visibility for a11y). */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Изменить порядок: «${bookmark.name}»`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "touch-none opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
            dragDisabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "opacity-0 transition-all group-hover:opacity-100",
            )}
            aria-label={`Действия закладки «${bookmark.name}»`}
          >
            <MoreVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Изменить</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
