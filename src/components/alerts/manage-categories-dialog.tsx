"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { AlertCategoryDto } from "./api";

interface ManageCategoriesDialogProps {
  open: boolean;
  categories: AlertCategoryDto[];
  onOpenChange: (open: boolean) => void;
  onRename: (category: AlertCategoryDto) => void;
  onDelete: (category: AlertCategoryDto) => void;
}

// AC-ALR-002 (rename/delete). Alerts has no persistent category tree in the
// main view (categories only surface as a filter), so rename/delete are
// reached through this list dialog rather than inline hover actions.
export function ManageCategoriesDialog({
  open,
  categories,
  onOpenChange,
  onRename,
  onDelete,
}: ManageCategoriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Управление категориями</DialogTitle>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Категорий пока нет. Создайте категорию, чтобы упорядочить
            оповещения.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="truncate text-sm text-foreground">
                  {category.name}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Переименовать ${category.name}`}
                    onClick={() => onRename(category)}
                  >
                    <Icon name="ri-edit-line" aria-hidden className="text-sm" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Удалить ${category.name}`}
                    onClick={() => onDelete(category)}
                  >
                    <Icon name="ri-delete-bin-line" aria-hidden className="text-sm" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Закрыть
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
