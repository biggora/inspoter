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
      setError("Category name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (state?.mode === "edit") {
        await messageCategoriesApi.rename(state.category.id, trimmed);
        toast.success("Category renamed.");
      } else {
        await messageCategoriesApi.create(trimmed);
        toast.success("Category created.");
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Couldn't save category. Try again.",
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
            {isEdit ? "Rename category" : "New category"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              autoFocus
            />
            {error && (
              <p id={errorId} className="text-sm text-(--error-text)">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit
                ? submitting
                  ? "Saving…"
                  : "Save"
                : submitting
                  ? "Creating…"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
