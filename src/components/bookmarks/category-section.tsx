"use client";

import { MoreVertical, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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
    <section aria-labelledby={headingId} className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2
          id={headingId}
          className="font-heading text-sm font-semibold text-foreground-800"
        >
          {category.name}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddBookmark}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus aria-hidden className="size-4" />
            Добавить
          </button>
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
      {category.bookmarks.length === 0 ? (
        <p className="text-xs text-foreground-400 py-3">
          Нет закладок в этой категории
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {category.bookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              onEdit={() => onEditBookmark(bookmark)}
              onDelete={() => onDeleteBookmark(bookmark)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
