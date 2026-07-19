"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// Dashed "+ Add bookmark" ghost card scoped to a category (design.md §3.3.1).
export function AddBookmarkCard({ onClick }: { onClick: () => void }) {
  const t = useTranslations("bookmarks");
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="min-h-[88px] flex-col border-dashed p-3"
    >
      <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
      <span>{t("addBookmarkCardLabel")}</span>
    </Button>
  );
}
