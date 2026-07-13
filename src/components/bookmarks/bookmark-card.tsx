"use client";

import { MoreVertical } from "lucide-react";

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
  onEdit: () => void;
  onDelete: () => void;
}

// AC-BM-011/012/013 (design.md §3.3.1). The whole card opens the bookmark's
// URL in a new tab; the overflow menu is a SIBLING (not a descendant) of
// that link via an absolutely-positioned full-cover anchor, so the trigger
// button never sits inside an <a> (avoids invalid/inaccessible nested
// interactive markup while keeping "click anywhere on the card" behavior
// and a real, natively-focusable link with the bookmark's name as its
// accessible name).
export function BookmarkCard({
  bookmark,
  onEdit,
  onDelete,
}: BookmarkCardProps) {
  return (
    <div className="group/card relative flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-(--border-active) hover:bg-(--bg-hover)">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={bookmark.name}
        className="absolute inset-0 z-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="relative z-10 shrink-0">
        <BookmarkIcon icon={bookmark.icon} name={bookmark.name} />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-foreground" title={bookmark.name}>
          {bookmark.name}
        </span>
        {bookmark.description ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {bookmark.description}
          </p>
        ) : null}
        <span className="truncate text-xs text-muted-foreground" title={bookmark.url}>
          {bookmark.url}
        </span>
      </div>

      <div className="relative z-20 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label="Ещё действия"
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
    </div>
  );
}
