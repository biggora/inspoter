import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";

// Phase 4: a bookmark may be assigned to either a top-level group or a
// subcategory with no restriction, so the dialog's options are the flattened
// tree; subcategory labels are prefixed so an operator can tell them apart
// from top-level groups in the plain <select>. Shared by the bookmarks board
// and by the domains views, which open the same dialog pre-filled.
export function flattenCategoryOptions(
  categories: CategoryWithBookmarks[],
): Array<{ id: string; name: string }> {
  return categories.flatMap((category) => [
    { id: category.id, name: category.name },
    ...category.childCategories.map((child) => ({
      id: child.id,
      name: `— ${child.name}`,
    })),
  ]);
}
