"use client";

import { MoreVertical } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Bookmark } from "@/generated/prisma/client";
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
// -interactive markup while keeping "click anywhere on the card" behavior
// and a real, natively-focusable link with the bookmark's name as its
// accessible name).
export function BookmarkCard({ bookmark, onEdit, onDelete }: BookmarkCardProps) {
  return (
    <div className="group/card relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-(--border-active) hover:bg-(--bg-hover)">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={bookmark.name}
        className="absolute inset-0 z-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="relative z-10 flex items-center gap-2">
        <BookmarkIcon icon={bookmark.icon} name={bookmark.name} />
        <span
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={bookmark.name}
        >
          {bookmark.name}
        </span>
        <div className="relative z-20">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100",
              )}
              aria-label="More options"
            >
              <MoreVertical aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bookmark.description && (
        <p className="relative z-10 line-clamp-2 text-xs text-muted-foreground">
          {bookmark.description}
        </p>
      )}
    </div>
  );
}
