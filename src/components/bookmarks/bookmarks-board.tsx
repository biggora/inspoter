"use client";

import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useOptimistic,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { BookmarkIcon, FileSearch, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { Bookmark, Category } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { bookmarksApi, categoriesApi } from "./api";
import { BookmarkDialog, type BookmarkDialogState } from "./bookmark-dialog";
import { CategoryDialog, type CategoryDialogState } from "./category-dialog";
import { CategorySection } from "./category-section";
import { DeleteBookmarkDialog } from "./delete-bookmark-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";

// Case-insensitive substring match against name/description/url, using the
// Russian locale collation to match this project's Russian-only-UI
// convention (design.md §5.1). `query` must already be lower-cased.
function matchesQuery(bookmark: Bookmark, query: string): boolean {
  return [bookmark.name, bookmark.description, bookmark.url].some((value) =>
    value?.toLocaleLowerCase("ru").includes(query),
  );
}

// Russian plural form for "закладка" driven by the standard one/few/many
// cardinal rule (matches the плитка/сервер pattern in servers-view.tsx).
function pluralizeBookmarks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "закладок";
  if (mod10 === 1) return "закладка";
  if (mod10 >= 2 && mod10 <= 4) return "закладки";
  return "закладок";
}

// Phase 4: a single node anywhere in the (exactly one level deep) category
// tree — either a top-level category or one of its subcategories.
// Subcategories never carry their own `childCategories`.
type CategoryNode =
  CategoryWithBookmarks | (Category & { bookmarks: Bookmark[] });

// Flat list of every node in the tree (top-level categories AND their
// subcategories) — used wherever a bookmark/category must be found by id
// regardless of nesting depth. The top-level `SortableContext` (category
// reorder) intentionally does NOT use this — it stays scoped to true
// top-level category ids only.
function flattenCategories(state: CategoryWithBookmarks[]): CategoryNode[] {
  return state.flatMap((category) => [category, ...category.childCategories]);
}

// Drag-and-drop reorder actions handled by `applyReorder` below. Category
// reorder replaces the whole top-level order; bookmark reorder carries the
// post-drop bookmark-id order for at most the two affected categories
// (source + destination), matching the PATCH /api/bookmarks/reorder
// contract shape 1:1 so the same array can be sent to the API.
type ReorderAction =
  | { type: "categories"; order: string[] }
  | {
      type: "bookmarks";
      categories: { categoryId: string; bookmarkIds: string[] }[];
    };

// Pure reducer for `useOptimistic` below — never called directly, only via
// `applyOptimisticReorder`/`useOptimistic`'s dispatch.
function applyReorder(
  state: CategoryWithBookmarks[],
  action: ReorderAction,
): CategoryWithBookmarks[] {
  if (action.type === "categories") {
    const byId = new Map(state.map((category) => [category.id, category]));
    return action.order
      .map((id) => byId.get(id))
      .filter((category): category is CategoryWithBookmarks =>
        Boolean(category),
      );
  }

  // Look up bookmarks across ALL categories AND subcategories (not just the
  // target one) so a cross-category move can find the dragged bookmark even
  // though it isn't (yet) a member of its destination container's
  // `bookmarks` array.
  const bookmarkById = new Map<string, Bookmark>();
  for (const node of flattenCategories(state)) {
    for (const bookmark of node.bookmarks)
      bookmarkById.set(bookmark.id, bookmark);
  }
  const updates = new Map(
    action.categories.map((entry) => [entry.categoryId, entry.bookmarkIds]),
  );
  // Resolves the new bookmark list for one container (top-level category or
  // subcategory) from `updates`, leaving it untouched if this drag didn't
  // touch it.
  function resolveBookmarks(
    containerId: string,
    currentBookmarks: Bookmark[],
  ): Bookmark[] {
    const bookmarkIds = updates.get(containerId);
    if (!bookmarkIds) return currentBookmarks;
    return (
      bookmarkIds
        .map((id) => bookmarkById.get(id))
        .filter((bookmark): bookmark is Bookmark => Boolean(bookmark))
        // Keep `bookmark.categoryId` consistent with its new optimistic
        // container so any consumer reading it mid-flight isn't stale.
        .map((bookmark) =>
          bookmark.categoryId === containerId
            ? bookmark
            : { ...bookmark, categoryId: containerId },
        )
    );
  }

  return state.map((category) => ({
    ...category,
    bookmarks: resolveBookmarks(category.id, category.bookmarks),
    childCategories: category.childCategories.map((sub) => ({
      ...sub,
      bookmarks: resolveBookmarks(sub.id, sub.bookmarks),
    })),
  }));
}

// Top-level Bookmarks orchestrator (design.md §3.3). Holds only dialog/UI
// state (useState) — the category/bookmark list itself is not duplicated in
// client state; every mutation calls the API then `router.refresh()`, which
// re-runs the Bookmarks server component and streams new props down without
// a full page reload (AC-BM-001/002/004/006/009/010).
//
// Deliberate, transient exception: drag-and-drop reorder additionally uses
// `useOptimistic` (below) to show the new order the instant a drag ends —
// a full `router.refresh()` round-trip cannot repaint fast enough to feel
// like a direct-manipulation drag. This is not a persistent second copy of
// the list: `optimisticCategories` always resets to the `categories` prop
// once `router.refresh()` re-renders this component with real server data,
// and it self-reverts if the reorder API call fails.
export function BookmarksBoard({
  categories,
}: {
  categories: CategoryWithBookmarks[];
}) {
  const router = useRouter();
  const [categoryDialog, setCategoryDialog] =
    useState<CategoryDialogState | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] =
    useState<CategoryNode | null>(null);
  const [bookmarkDialog, setBookmarkDialog] =
    useState<BookmarkDialogState | null>(null);
  const [deleteBookmarkTarget, setDeleteBookmarkTarget] =
    useState<Bookmark | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const [optimisticCategories, applyOptimisticReorder] = useOptimistic(
    categories,
    applyReorder,
  );

  // dnd-kit's "multiple containers" pattern needs ONE top-level `DndContext`
  // (owned here, not in CategorySection) because moving a bookmark between
  // two categories requires simultaneous knowledge of both containers' item
  // lists — a container-local `onDragEnd` can only see its own list.
  // CategorySection/BookmarkCard only call `useSortable()` and stay
  // presentational. A small 4px pointer-activation distance (below) avoids
  // hijacking ordinary clicks (rename/delete menu, Добавить, card links) as
  // accidental drags — the e2e mouse-drag test must move the pointer more
  // than 4px before dnd-kit arms the drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Phase 4: a bookmark may be assigned to either a top-level group or a
  // subcategory with no restriction, so options are the flattened tree;
  // subcategory labels are prefixed so an operator can tell them apart from
  // top-level groups in the plain <select>.
  const categoryOptions = optimisticCategories.flatMap((category) => [
    { id: category.id, name: category.name },
    ...category.childCategories.map((sub) => ({
      id: sub.id,
      name: `— ${sub.name}`,
    })),
  ]);

  function handleRename(category: Category) {
    setCategoryDialog({ mode: "edit", category });
  }

  function handleAddBookmark(categoryId: string) {
    setBookmarkDialog({ mode: "create", categoryId });
  }

  // Client-only search/filter (design.md §5.1). The raw query drives the
  // input while filtering runs against the deferred value, so typing stays
  // responsive without hand-rolled debounce logic. An empty query renders
  // `optimisticCategories` unfiltered — zero behavior change from the
  // no-search case.
  const trimmedQuery = deferredQuery.trim();
  const normalizedQuery = trimmedQuery.toLocaleLowerCase("ru");
  const isSearching = normalizedQuery !== "";
  // Phase 4: subcategory bookmarks are filtered the same way as top-level
  // ones, and a subcategory with zero matches is dropped entirely — mirrors
  // the existing top-level "no match -> not rendered" behavior exactly.
  const filteredCategories = useMemo(() => {
    if (!isSearching) return optimisticCategories;
    return optimisticCategories
      .map((category) => ({
        ...category,
        bookmarks: category.bookmarks.filter((bookmark) =>
          matchesQuery(bookmark, normalizedQuery),
        ),
        childCategories: category.childCategories
          .map((sub) => ({
            ...sub,
            bookmarks: sub.bookmarks.filter((bookmark) =>
              matchesQuery(bookmark, normalizedQuery),
            ),
          }))
          .filter((sub) => sub.bookmarks.length > 0),
      }))
      .filter(
        (category) =>
          category.bookmarks.length > 0 || category.childCategories.length > 0,
      );
  }, [optimisticCategories, isSearching, normalizedQuery]);

  // Delete/rename must always act on the full, unfiltered category — using
  // the search-filtered copy here would understate DeleteCategoryDialog's
  // cascade-delete bookmark count while a query is active. Flattened across
  // both levels so subcategory rename/delete targets resolve too.
  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryNode>();
    for (const node of flattenCategories(optimisticCategories)) {
      map.set(node.id, node);
    }
    return map;
  }, [optimisticCategories]);

  const matchCount = isSearching
    ? filteredCategories.reduce(
        (sum, category) =>
          sum +
          category.bookmarks.length +
          category.childCategories.reduce(
            (subSum, sub) => subSum + sub.bookmarks.length,
            0,
          ),
        0,
      )
    : 0;
  const liveRegionMessage = !isSearching
    ? ""
    : matchCount === 0
      ? "Ничего не найдено"
      : `Найдено ${matchCount} ${pluralizeBookmarks(matchCount)}`;

  // Dragging is inert while a search query is active: reordering a
  // filtered subset would silently corrupt the true position sequence for
  // bookmarks/categories hidden by the filter. `dragDisabled` is threaded
  // down to every `useSortable()` call (category- and bookmark-level) so no
  // handle is operable by pointer or keyboard while `isSearching` is true.
  // The `DndContext` itself stays mounted throughout to avoid remount
  // flicker when a search starts/ends.
  function handleDragEnd(event: DragEndEvent) {
    if (isSearching) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as
      | { type: "category" }
      | { type: "bookmark"; categoryId: string }
      | undefined;
    const overData = over.data.current as
      | { type: "category" }
      | { type: "bookmark"; categoryId: string }
      | undefined;
    if (!activeData) return;

    if (activeData.type === "category") {
      if (overData?.type !== "category") return;
      const oldIndex = optimisticCategories.findIndex(
        (category) => category.id === active.id,
      );
      const newIndex = optimisticCategories.findIndex(
        (category) => category.id === over.id,
      );
      if (oldIndex === -1 || newIndex === -1) return;
      const order = arrayMove(optimisticCategories, oldIndex, newIndex).map(
        (category) => category.id,
      );

      startTransition(async () => {
        applyOptimisticReorder({ type: "categories", order });
        try {
          await categoriesApi.reorder(order);
        } catch {
          toast.error(
            "Не удалось изменить порядок категорий. Попробуйте снова.",
          );
        }
        router.refresh();
      });
      return;
    }

    // Bookmark drag: within one category (plain arrayMove) or across two
    // (source loses the id, destination gains it at the drop position).
    // The API payload always carries at most these two affected categories
    // (contract: `{ categories: [...] }`, max 2 entries).
    const sourceCategoryId = activeData.categoryId;
    const destinationCategoryId =
      overData?.type === "bookmark"
        ? overData.categoryId
        : overData?.type === "category"
          ? String(over.id)
          : undefined;
    if (!destinationCategoryId) return;

    // A bookmark's source/destination container may be a top-level category
    // OR a subcategory — `categoryById` is flattened across both levels
    // (Phase 4) so either resolves here.
    const sourceCategory = categoryById.get(sourceCategoryId);
    const destinationCategory = categoryById.get(destinationCategoryId);
    if (!sourceCategory || !destinationCategory) return;

    let payload: { categoryId: string; bookmarkIds: string[] }[];
    if (sourceCategoryId === destinationCategoryId) {
      const oldIndex = sourceCategory.bookmarks.findIndex(
        (bookmark) => bookmark.id === active.id,
      );
      const newIndex =
        overData?.type === "bookmark"
          ? sourceCategory.bookmarks.findIndex(
              (bookmark) => bookmark.id === over.id,
            )
          : sourceCategory.bookmarks.length - 1;
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const bookmarkIds = arrayMove(
        sourceCategory.bookmarks,
        oldIndex,
        newIndex,
      ).map((bookmark) => bookmark.id);
      payload = [{ categoryId: sourceCategoryId, bookmarkIds }];
    } else {
      const sourceIds = sourceCategory.bookmarks
        .filter((bookmark) => bookmark.id !== active.id)
        .map((bookmark) => bookmark.id);
      const destIds = destinationCategory.bookmarks.map(
        (bookmark) => bookmark.id,
      );
      const insertAt =
        overData?.type === "bookmark"
          ? destIds.findIndex((id) => id === over.id)
          : destIds.length;
      destIds.splice(
        insertAt === -1 ? destIds.length : insertAt,
        0,
        String(active.id),
      );
      payload = [
        { categoryId: sourceCategoryId, bookmarkIds: sourceIds },
        { categoryId: destinationCategoryId, bookmarkIds: destIds },
      ];
    }

    startTransition(async () => {
      applyOptimisticReorder({ type: "bookmarks", categories: payload });
      try {
        await bookmarksApi.reorder(payload);
      } catch {
        toast.error("Не удалось изменить порядок закладок. Попробуйте снова.");
      }
      router.refresh();
    });
  }

  return (
    <PageBody>
      <PageHeader
        title="Закладки"
        actions={
          <Button onClick={() => setCategoryDialog({ mode: "create" })}>
            <Plus aria-hidden data-icon="inline-start" />
            Новая категория
          </Button>
        }
      >
        {categories.length > 0 && (
          <FilterBar>
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                id={searchId}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Название, описание или URL"
                aria-label="Поиск закладок"
              />
              {query && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setQuery("")}
                    aria-label="Очистить поиск"
                  >
                    <X aria-hidden data-icon="inline-start" />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </FilterBar>
        )}
      </PageHeader>

      <p role="status" aria-live="polite" className="sr-only">
        {liveRegionMessage}
      </p>

      {categories.length === 0 ? (
        <EmptyState
          icon={BookmarkIcon}
          title="Нет закладок"
          description="Создайте категорию, чтобы начать добавлять закладки."
          action={
            <Button onClick={() => setCategoryDialog({ mode: "create" })}>
              <Plus aria-hidden data-icon="inline-start" />
              Создать категорию
            </Button>
          }
        />
      ) : isSearching && filteredCategories.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="Ничего не найдено"
          description={`По запросу «${trimmedQuery}» закладок не найдено. Попробуйте изменить запрос или сбросить поиск.`}
          action={
            <Button variant="outline" onClick={() => setQuery("")}>
              Сбросить поиск
            </Button>
          }
        />
      ) : (
        <DndContext
          id="bookmarks-dnd-context"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredCategories.map((category) => category.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-6">
              {filteredCategories.map((category) => {
                const original = categoryById.get(category.id) ?? category;
                return (
                  <CategorySection
                    key={category.id}
                    category={category}
                    dragDisabled={isSearching}
                    onRename={() => handleRename(original)}
                    onDelete={() => setDeleteCategoryTarget(original)}
                    onAddBookmark={() => handleAddBookmark(category.id)}
                    onEditBookmark={(bookmark) =>
                      setBookmarkDialog({ mode: "edit", bookmark })
                    }
                    onDeleteBookmark={(bookmark) =>
                      setDeleteBookmarkTarget(bookmark)
                    }
                    onRenameSubcategory={(subcategory) => {
                      const originalSub =
                        categoryById.get(subcategory.id) ?? subcategory;
                      setCategoryDialog({
                        mode: "edit",
                        category: originalSub,
                      });
                    }}
                    onDeleteSubcategory={(subcategory) => {
                      const originalSub =
                        categoryById.get(subcategory.id) ?? subcategory;
                      setDeleteCategoryTarget(originalSub);
                    }}
                    onAddBookmarkToSubcategory={handleAddBookmark}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <CategoryDialog
        state={categoryDialog}
        topLevelCategories={optimisticCategories}
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
    </PageBody>
  );
}
