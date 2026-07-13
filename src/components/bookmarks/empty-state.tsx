"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  onCreateCategory,
}: {
  onCreateCategory: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-background-200 bg-background-50 px-6 py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center">
        <i className="ri-bookmark-line text-2xl text-secondary-600"></i>
      </div>
      <h2 className="font-heading text-lg font-semibold text-foreground-900">
        Нет закладок
      </h2>
      <p className="max-w-sm text-sm text-foreground-500">
        Создайте категорию, чтобы начать добавлять закладки.
      </p>
      <Button onClick={onCreateCategory}>
        <Plus aria-hidden className="size-4" />
        Создать категорию
      </Button>
    </div>
  );
}
