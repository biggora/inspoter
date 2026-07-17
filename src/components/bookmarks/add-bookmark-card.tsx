"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

// Dashed "+ Add bookmark" ghost card scoped to a category (design.md §3.3.1).
export function AddBookmarkCard({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="min-h-[88px] flex-col border-dashed p-3"
    >
      <Plus aria-hidden data-icon="inline-start" />
      <span>Добавить закладку</span>
    </Button>
  );
}
