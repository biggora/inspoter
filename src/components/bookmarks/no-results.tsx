"use client";

import { Button } from "@/components/ui/button";

export function NoResults({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-background-200 bg-background-50 px-6 py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center">
        <i className="ri-file-search-line text-2xl text-secondary-600"></i>
      </div>
      <h2 className="font-heading text-lg font-semibold text-foreground-900">
        Ничего не найдено
      </h2>
      <p className="max-w-sm text-sm text-foreground-500">
        По запросу «{query}» закладок не найдено. Попробуйте изменить запрос
        или сбросить поиск.
      </p>
      <Button variant="outline" onClick={onClear}>
        Сбросить поиск
      </Button>
    </div>
  );
}
