"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Bookmark } from "@/generated/prisma/client";
import { ApiError, bookmarksApi } from "./api";
import { isValidHttpUrl } from "./validation";

export type BookmarkDialogState =
  { mode: "create"; categoryId: string } | { mode: "edit"; bookmark: Bookmark };

interface BookmarkDialogProps {
  state: BookmarkDialogState | null;
  categories: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  url?: string;
}

// AC-BM-006..009/011 (design.md §3.3.4). Category uses a plain native
// <select> rather than the shadcn Select primitive — a deliberate deviation
// (see delivery report) so the field exposes standard <select>/<option>
// semantics.
export function BookmarkDialog({
  state,
  categories,
  onOpenChange,
  onSaved,
}: BookmarkDialogProps) {
  const nameId = useId();
  const urlId = useId();
  const iconId = useId();
  const descriptionId = useId();
  const categoryFieldId = useId();
  const nameErrorId = useId();
  const urlErrorId = useId();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  // Reset the form when the dialog target changes, using React's "adjust state
  // while rendering on prop change" pattern instead of an effect
  // (react.dev/reference/react/useState).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const bookmark = state.bookmark;
      setName(bookmark.name);
      setUrl(bookmark.url);
      setIcon(bookmark.icon ?? "");
      setDescription(bookmark.description ?? "");
      setCategory(bookmark.categoryId);
    } else if (state?.mode === "create") {
      setName("");
      setUrl("");
      setIcon("");
      setDescription("");
      setCategory(state.categoryId);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const nextErrors: FieldErrors = {};
    if (!trimmedName) nextErrors.name = "Название закладки обязательно.";
    if (!trimmedUrl) nextErrors.url = "URL обязателен.";
    else if (!isValidHttpUrl(trimmedUrl)) {
      nextErrors.url = "Введите корректный URL, начинающийся с http:// или https://.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        url: trimmedUrl,
        icon: icon.trim() || null,
        description: description.trim() || null,
        categoryId: category,
      };
      if (state?.mode === "edit") {
        await bookmarksApi.update(state.bookmark.id, payload);
        toast.success("Закладка обновлена.");
      } else {
        await bookmarksApi.create(payload);
        toast.success("Закладка создана.");
      }
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({ name: err.fieldErrors.name, url: err.fieldErrors.url });
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось сохранить закладку. Попробуйте снова.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать закладку" : "Новая закладка"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Название</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? nameErrorId : undefined}
              autoFocus
            />
            {errors.name && (
              <p id={nameErrorId} className="text-sm text-(--error-text)">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={urlId}>URL</Label>
            <Input
              id={urlId}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-required="true"
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={errors.url ? urlErrorId : undefined}
              placeholder="https://"
            />
            {errors.url && (
              <p id={urlErrorId} className="text-sm text-(--error-text)">
                {errors.url}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={iconId}>Иконка (необязательно)</Label>
            <Input
              id={iconId}
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              placeholder="Эмодзи, название иконки или URL изображения"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={descriptionId}>Описание (необязательно)</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={categoryFieldId}>Категория</Label>
            <select
              id={categoryFieldId}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit
                ? submitting
                  ? "Сохранение…"
                  : "Сохранить изменения"
                : submitting
                  ? "Создание…"
                  : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
