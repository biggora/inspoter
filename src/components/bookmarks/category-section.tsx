"use client";

import { MoreVertical, Plus } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Bookmark } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { cn } from "@/lib/utils";
import { BookmarkCard } from "./bookmark-card";

interface CategorySectionProps {
  category: CategoryWithBookmarks;
  onRename: () => void;
  onDelete: () => void;
  onAddBookmark: () => void;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

// AC-BM-012 (design.md §3.3.1): one section per category, category name +
// overflow menu (rename/delete) in the header row, then a responsive card
// grid.
export function CategorySection({
  category,
  onRename,
  onDelete,
  onAddBookmark,
  onEditBookmark,
  onDeleteBookmark,
}: CategorySectionProps) {
  const headingId = `category-${category.id}-heading`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {category.name}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onAddBookmark}>
            <Plus aria-hidden className="size-4" />
            Добавить
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
              )}
              aria-label="Ещё действия"
            >
              <MoreVertical aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                Переименовать категорию
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                Удалить категорию
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {category.bookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            onEdit={() => onEditBookmark(bookmark)}
            onDelete={() => onDeleteBookmark(bookmark)}
          />
        ))}
      </div>
    </section>
  );
}
