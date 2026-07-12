"use client";

import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

// AC-BM-014: shown only when zero categories and zero bookmarks exist.
// Neutral, not an error (design.md §3.3.6).
export function EmptyState({ onCreateCategory }: { onCreateCategory: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-24 text-center">
      <Star aria-hidden className="size-12 text-(--text-muted)" />
      <h2 className="text-lg font-semibold text-foreground">No bookmarks yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Create your first category, then add the links you use every day.
      </p>
      <Button onClick={onCreateCategory}>
        <Plus aria-hidden className="size-4" />
        Create category
      </Button>
    </div>
  );
}
