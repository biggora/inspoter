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
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { AddBookmarkCard } from "./add-bookmark-card";
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
// grid ending with the "+ Add bookmark" ghost card.
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
        <h3
          id={headingId}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {category.name}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label="More options"
          >
            <MoreVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename category</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete category
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {category.bookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            onEdit={() => onEditBookmark(bookmark)}
            onDelete={() => onDeleteBookmark(bookmark)}
          />
        ))}
        <AddBookmarkCard onClick={onAddBookmark} />
      </div>
    </section>
  );
}
