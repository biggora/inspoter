"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, workspacesApi } from "./api";

interface RenameWorkspaceFormProps {
  workspaceId: string;
  currentName: string;
}

// AC scope: Settings > Workspace, rename form (task spec item 1). Follows the
// Bookmarks dialogs' mutate-then-`router.refresh()` pattern so the sidebar's
// WorkspaceSwitcher and this page pick up the new name without a full reload.
export function RenameWorkspaceForm({
  workspaceId,
  currentName,
}: RenameWorkspaceFormProps) {
  const router = useRouter();
  const nameId = useId();

  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Название рабочего пространства обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await workspacesApi.rename(workspaceId, trimmed);
      toast.success("Рабочее пространство переименовано.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось переименовать рабочее пространство.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Название рабочего пространства</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-required="true"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-sm text-(--error-text)">{error}</p>}
      </div>
      <div>
        <Button
          type="submit"
          disabled={submitting || name.trim() === currentName}
        >
          {submitting ? "Сохранение…" : "Сохранить изменения"}
        </Button>
      </div>
    </form>
  );
}
