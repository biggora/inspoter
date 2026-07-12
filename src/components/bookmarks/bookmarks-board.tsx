"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Bookmark, Category } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { BookmarkDialog, type BookmarkDialogState } from "./bookmark-dialog";
import { CategoryDialog, type CategoryDialogState } from "./category-dialog";
import { CategorySection } from "./category-section";
import { DeleteBookmarkDialog } from "./delete-bookmark-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import { EmptyState } from "./empty-state";

// Top-level Bookmarks orchestrator (design.md §3.3). Holds only dialog/UI
// state (useState) — the category/bookmark list itself is not duplicated in
// client state; every mutation calls the API then `router.refresh()`, which
// re-runs the Bookmarks server component and streams new props down without
// a full page reload (AC-BM-001/002/004/006/009/010).
export function BookmarksBoard({ categories }: { categories: CategoryWithBookmarks[] }) {
  const router = useRouter();
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<CategoryWithBookmarks | null>(
    null,
  );
  const [bookmarkDialog, setBookmarkDialog] = useState<BookmarkDialogState | null>(null);
  const [deleteBookmarkTarget, setDeleteBookmarkTarget] = useState<Bookmark | null>(null);

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  function handleRename(category: Category) {
    setCategoryDialog({ mode: "edit", category });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Bookmarks</h1>
        <Button onClick={() => setCategoryDialog({ mode: "create" })}>
          <Plus aria-hidden className="size-4" />
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState onCreateCategory={() => setCategoryDialog({ mode: "create" })} />
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              onRename={() => handleRename(category)}
              onDelete={() => setDeleteCategoryTarget(category)}
              onAddBookmark={() => setBookmarkDialog({ mode: "create", categoryId: category.id })}
              onEditBookmark={(bookmark) => setBookmarkDialog({ mode: "edit", bookmark })}
              onDeleteBookmark={(bookmark) => setDeleteBookmarkTarget(bookmark)}
            />
          ))}
        </div>
      )}

      <CategoryDialog
        state={categoryDialog}
        onOpenChange={(open) => !open && setCategoryDialog(null)}
        onSaved={() => {
          setCategoryDialog(null);
          router.refresh();
        }}
      />
      <DeleteCategoryDialog
        category={deleteCategoryTarget}
        onOpenChange={(open) => !open && setDeleteCategoryTarget(null)}
        onDeleted={() => {
          setDeleteCategoryTarget(null);
          router.refresh();
        }}
      />
      <BookmarkDialog
        state={bookmarkDialog}
        categories={categoryOptions}
        onOpenChange={(open) => !open && setBookmarkDialog(null)}
        onSaved={() => {
          setBookmarkDialog(null);
          router.refresh();
        }}
      />
      <DeleteBookmarkDialog
        bookmark={deleteBookmarkTarget}
        onOpenChange={(open) => !open && setDeleteBookmarkTarget(null)}
        onDeleted={() => {
          setDeleteBookmarkTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}
