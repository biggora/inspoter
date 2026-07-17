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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { Category } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";
import { ApiError, categoriesApi } from "./api";

export type CategoryDialogState =
  { mode: "create" } | { mode: "edit"; category: Category };

interface CategoryDialogProps {
  state: CategoryDialogState | null;
  // Phase 4: top-level categories only, used to populate the parent-select
  // (each carries `childCategories` so the "already has subcategories"
  // exclusion rule below can be applied client-side).
  topLevelCategories: CategoryWithBookmarks[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// AC-BM-001/002/005 (design.md §3.3.2). Create/rename share one dialog;
// validated on submit with the exact design copy, then re-validated
// defensively against the API's zod response (api.ts).
export function CategoryDialog({
  state,
  topLevelCategories,
  onOpenChange,
  onSaved,
}: CategoryDialogProps) {
  const nameId = useId();
  const parentFieldId = useId();
  const parentHelperId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  // Reset the form when the dialog target changes (open/create/rename-of-another
  // category), using React's "adjust state while rendering on prop change"
  // pattern instead of an effect (react.dev/reference/react/useState).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setName(state?.mode === "edit" ? state.category.name : "");
    setParentCategoryId(
      state?.mode === "edit" ? (state.category.parentCategoryId ?? "") : "",
    );
    setError(null);
  }

  // Phase 4 (FR-BM-00x): a top-level category that already has subcategories
  // remains a perfectly valid parent choice for OTHER new/existing
  // subcategories — the depth cap only restricts the CHILD side (server rule
  // `assertParentIsTopLevel`). The only restriction mirrored here is
  // `assertNoExistingChildCategories`: the category currently being edited
  // cannot be assigned ANY parent if it already has subcategories of its
  // own (that would create a 3-level chain), so in that case the whole
  // field is disabled rather than filtering candidate options.
  const editingCategory =
    state?.mode === "edit"
      ? topLevelCategories.find(
          (candidate) => candidate.id === state.category.id,
        )
      : undefined;
  const editingHasChildren = (editingCategory?.childCategories.length ?? 0) > 0;
  const parentOptions = topLevelCategories.filter(
    (candidate) =>
      !(state?.mode === "edit" && candidate.id === state.category.id),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Название категории обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const parentValue =
      editingHasChildren || parentCategoryId === "" ? null : parentCategoryId;
    try {
      if (state?.mode === "edit") {
        await categoriesApi.rename(state.category.id, trimmed, parentValue);
        toast.success("Категория переименована.");
      } else {
        await categoriesApi.create(trimmed, parentValue);
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
              <FieldLabel htmlFor={nameId}>Название</FieldLabel>
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

            <Field data-disabled={editingHasChildren || undefined}>
              <FieldLabel htmlFor={parentFieldId}>
                Родительская категория
              </FieldLabel>
              <NativeSelect
                id={parentFieldId}
                value={editingHasChildren ? "" : parentCategoryId}
                onChange={(event) => setParentCategoryId(event.target.value)}
                disabled={editingHasChildren}
                aria-describedby={
                  editingHasChildren ? parentHelperId : undefined
                }
                className="w-full"
              >
                <NativeSelectOption value="">
                  — Нет (группа верхнего уровня) —
                </NativeSelectOption>
                {parentOptions.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {editingHasChildren && (
                <FieldDescription id={parentHelperId}>
                  У этой категории есть подкатегории, поэтому она не может стать
                  чьей-либо подкатегорией.
                </FieldDescription>
              )}
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
