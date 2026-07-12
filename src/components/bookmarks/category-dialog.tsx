"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
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
import type { Category } from "@/generated/prisma/client";
import { ApiError, categoriesApi } from "./api";

export type CategoryDialogState = { mode: "create" } | { mode: "edit"; category: Category };

interface CategoryDialogProps {
  state: CategoryDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// AC-BM-001/002/005 (design.md §3.3.2). Create/rename share one dialog;
// validated on submit with the exact design copy, then re-validated
// defensively against the API's zod response (api.ts).
export function CategoryDialog({ state, onOpenChange, onSaved }: CategoryDialogProps) {
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  useEffect(() => {
    if (state?.mode === "edit") {
      setName(state.category.name);
    } else {
      setName("");
    }
    setError(null);
  }, [state]);

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
        await categoriesApi.rename(state.category.id, trimmed);
        toast.success("Category renamed.");
      } else {
        await categoriesApi.create(trimmed);
        toast.success("Category created.");
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Couldn't save category. Try again.",
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
          <DialogTitle>{isEdit ? "Rename category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit ? (submitting ? "Saving…" : "Save") : submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
