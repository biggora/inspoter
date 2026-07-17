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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageCategoriesApi, type MessageCategoryDto } from "./api";

export type CategoryDialogState =
  { mode: "create" } | { mode: "edit"; category: MessageCategoryDto };

interface CategoryDialogProps {
  state: CategoryDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// AC-MSG-001/003: create/rename share one dialog, same lightweight
// name-only pattern as Bookmarks categories (design.md §6.4).
export function CategoryDialog({
  state,
  onOpenChange,
  onSaved,
}: CategoryDialogProps) {
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setName(state?.mode === "edit" ? state.category.name : "");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Название категории обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (state?.mode === "edit") {
        await messageCategoriesApi.rename(state.category.id, trimmed);
        toast.success("Категория переименована.");
      } else {
        await messageCategoriesApi.create(trimmed);
        toast.success("Категория создана.");
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось сохранить категорию. Попробуйте снова.",
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
          <DialogTitle>
            {isEdit ? "Переименовать категорию" : "Новая категория"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>Название категории</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit ? (
                submitting ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  "Сохранить"
                )
              ) : submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  Создание…
                </>
              ) : (
                "Создать"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
