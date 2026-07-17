"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, workspacesApi } from "./api";

// AC scope: Settings > Workspace, "Create new workspace" section (task spec
// item 4). Creating switches the active workspace to the new one — matching
// the sidebar WorkspaceSwitcher's create flow — so `router.refresh()` re-
// renders this same page with the new workspace's (empty) data.
export function CreateWorkspaceForm() {
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();

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
      <FieldGroup className="sm:flex-row sm:items-end">
        <Field className="flex-1" data-invalid={!!error || undefined}>
          <FieldLabel htmlFor={nameId}>
            Название нового рабочего пространства
          </FieldLabel>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-required="true"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <FieldError id={errorId}>{error}</FieldError>
        </Field>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden />
              Создание…
            </>
          ) : (
            "Создать рабочее пространство"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
