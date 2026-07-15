"use client";

import { Plus } from "lucide-react";

// Dashed "+ Add bookmark" ghost card scoped to a category (design.md §3.3.1).
export function AddBookmarkCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground outline-none transition-colors hover:border-(--border-active) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus aria-hidden className="size-4" />
      <span>Добавить закладку</span>
    </button>
  );
}
