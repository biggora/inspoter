"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, workspacesApi } from "./api";

// AC scope: Settings > Workspace, "Create new workspace" section (task spec
// item 4). Creating switches the active workspace to the new one — matching
// the sidebar WorkspaceSwitcher's create flow — so `router.refresh()` re-
// renders this same page with the new workspace's (empty) data.
export function CreateWorkspaceForm() {
  const router = useRouter();
  const nameId = useId();

  const [name, setName] = useState("");
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
      const workspace = await workspacesApi.create(trimmed);
      await workspacesApi.switchTo(workspace.id);
      toast.success("Рабочее пространство создано.");
      setName("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось создать рабочее пространство.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={nameId}>Название нового рабочего пространства</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-required="true"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-sm text-(--error-text)">{error}</p>}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Создание…" : "Создать рабочее пространство"}
      </Button>
    </form>
  );
}
