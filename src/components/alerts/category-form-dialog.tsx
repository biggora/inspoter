"use client";

import { useTranslations } from "next-intl";
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
import { alertCategoriesApi, ApiError, type AlertCategoryDto } from "./api";

export type CategoryFormState =
  { mode: "create" } | { mode: "edit"; category: AlertCategoryDto };

interface CategoryFormDialogProps {
  state: CategoryFormState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// AC-ALR-001/002: create/rename share one dialog, same lightweight
// name-only pattern as Bookmarks categories (design.md §6.6).
export function CategoryFormDialog({
  state,
  onOpenChange,
  onSaved,
}: CategoryFormDialogProps) {
  const t = useTranslations("alerts");
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
      setError(t("categoryNameRequiredError"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (state?.mode === "edit") {
        await alertCategoriesApi.rename(state.category.id, trimmed);
        toast.success(t("categoryRenamedToast"));
      } else {
        await alertCategoriesApi.create(trimmed);
        toast.success(t("categoryCreatedToast"));
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveCategoryError"),
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
            {isEdit ? t("renameCategoryTitle") : t("newCategoryTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>{t("nameLabel")}</FieldLabel>
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
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit ? (
                submitting ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    {t("savingButton")}
                  </>
                ) : (
                  t("saveButton")
                )
              ) : submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("creatingButton")}
                </>
              ) : (
                t("createButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
