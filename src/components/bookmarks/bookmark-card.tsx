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

export function BookmarkCard({
  bookmark,
  onEdit,
  onDelete,
}: BookmarkCardProps) {
  return (
    <div className="group relative flex items-start gap-3 rounded-lg border border-background-200 bg-background-50 p-3 text-sm transition-colors hover:border-background-300">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        <BookmarkIcon icon={bookmark.icon} name={bookmark.name} />
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

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "opacity-0 transition-all group-hover:opacity-100",
            )}
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
