"use client";

import { GripVertical, MoreVertical, Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Bookmark, Category } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { cn } from "@/lib/utils";
import { BookmarkCard } from "./bookmark-card";

interface CategorySectionProps {
  category: CategoryWithBookmarks;
  dragDisabled: boolean;
  onRename: () => void;
  onDelete: () => void;
  onAddBookmark: () => void;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  // Phase 4: one level of subcategory nesting. Subcategories are not
  // drag-reorderable (reparenting only happens via CategoryDialog's parent
  // select) so they get their own add/rename/delete actions but no drag
  // handle — see design note in bookmarks-board.tsx.
  onRenameSubcategory: (subcategory: Category) => void;
  onDeleteSubcategory: (
    subcategory: Category & { bookmarks: Bookmark[] },
  ) => void;
  onAddBookmarkToSubcategory: (subcategoryId: string) => void;
}

export function CategorySection({
  category,
  dragDisabled,
  onRename,
  onDelete,
  onAddBookmark,
  onEditBookmark,
  onDeleteBookmark,
  onRenameSubcategory,
  onDeleteSubcategory,
  onAddBookmarkToSubcategory,
}: CategorySectionProps) {
  const headingId = `category-${category.id}-heading`;

  // Category-level sortable — reorder ownership (`onDragEnd`) lives in
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
    id: category.id,
    data: { type: "category" },
    disabled: dragDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const bookmarkIds = category.bookmarks.map((bookmark) => bookmark.id);

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-labelledby={headingId}
      className={cn("animate-fade-in", isDragging && "opacity-60")}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Drag handle: a third, independent focus stop — separate from
              every card link and the category/bookmark action menus
              (design.md §5.1 a11y rule). */}
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            {...attributes}
            {...listeners}
            aria-label={`Изменить порядок категории «${category.name}»`}
            className={cn(
              "shrink-0 touch-none",
              dragDisabled
                ? "cursor-not-allowed opacity-30"
                : "cursor-grab active:cursor-grabbing",
            )}
          >
            <GripVertical aria-hidden data-icon="inline-start" />
          </Button>
          <h2
            id={headingId}
            className="truncate font-heading text-sm font-semibold text-foreground-800"
          >
            {category.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddBookmark}
          >
            <Plus aria-hidden data-icon="inline-start" />
            Добавить
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label={`Действия категории «${category.name}»`}
            >
              <MoreVertical aria-hidden data-icon="inline-start" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onRename}>
                  Переименовать категорию
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Удалить категорию
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {category.bookmarks.length === 0 ? (
        <EmptyState
          size="xs"
          align="start"
          bordered={false}
          description="Нет закладок в этой категории"
          className="py-3"
        />
      ) : (
        <SortableContext items={bookmarkIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {category.bookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                dragDisabled={dragDisabled}
                onEdit={() => onEditBookmark(bookmark)}
                onDelete={() => onDeleteBookmark(bookmark)}
              />
            ))}
          </div>
        </SortableContext>
      )}

      {category.childCategories.length > 0 && (
        <div className="mt-6 flex flex-col gap-6 border-t border-background-200 pt-6 pl-6">
          {category.childCategories.map((subcategory) => (
            <SubcategorySection
              key={subcategory.id}
              subcategory={subcategory}
              dragDisabled={dragDisabled}
              onRename={() => onRenameSubcategory(subcategory)}
              onDelete={() => onDeleteSubcategory(subcategory)}
              onAddBookmark={() => onAddBookmarkToSubcategory(subcategory.id)}
              onEditBookmark={onEditBookmark}
              onDeleteBookmark={onDeleteBookmark}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SubcategorySectionProps {
  subcategory: Category & { bookmarks: Bookmark[] };
  dragDisabled: boolean;
  onRename: () => void;
  onDelete: () => void;
  onAddBookmark: () => void;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

// Split out from CategorySection so `useDroppable` below is called once per
// subcategory instance rather than inside a `.map()` callback (Rules of
// Hooks).
function SubcategorySection({
  subcategory,
  dragDisabled,
  onRename,
  onDelete,
  onAddBookmark,
  onEditBookmark,
  onDeleteBookmark,
}: SubcategorySectionProps) {
  const headingId = `category-${subcategory.id}-heading`;
  const bookmarkIds = subcategory.bookmarks.map((bookmark) => bookmark.id);

  // Subcategories are never drag-reorderable (no drag handle — reparenting
  // only happens via CategoryDialog's parent-select), so this section uses
  // `useDroppable` (not `useSortable`): it registers as a valid drop target
  // — needed so a bookmark can be dropped into an EMPTY subcategory, which
  // has no `BookmarkCard` to drop onto — without becoming draggable itself.
  // `data.type: "category"` matches the same shape CategorySection's
  // top-level `useSortable` already produces, so bookmarks-board.tsx's
  // `handleDragEnd` resolves it identically (destination container = this
  // subcategory's id).
  const { setNodeRef } = useDroppable({
    id: subcategory.id,
    data: { type: "category" },
  });

  return (
    <section ref={setNodeRef} aria-labelledby={headingId}>
      <div className="flex items-center justify-between mb-3">
        <h3
          id={headingId}
          className="truncate font-heading text-sm font-semibold text-foreground-700"
        >
          {subcategory.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddBookmark}
          >
            <Plus aria-hidden data-icon="inline-start" />
            Добавить
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label={`Действия категории «${subcategory.name}»`}
            >
              <MoreVertical aria-hidden data-icon="inline-start" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onRename}>
                  Переименовать категорию
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Удалить категорию
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {subcategory.bookmarks.length === 0 ? (
        <EmptyState
          size="xs"
          align="start"
          bordered={false}
          description="Нет закладок в этой категории"
          className="py-3"
        />
      ) : (
        <SortableContext items={bookmarkIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {subcategory.bookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                dragDisabled={dragDisabled}
                onEdit={() => onEditBookmark(bookmark)}
                onDelete={() => onDeleteBookmark(bookmark)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}
