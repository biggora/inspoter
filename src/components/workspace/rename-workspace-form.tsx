"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("workspace");
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();

  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequiredError"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await workspacesApi.rename(workspaceId, trimmed);
      toast.success(t("renamedToast"));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(err instanceof ApiError ? err.message : t("renameError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
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
          />
          <FieldError id={errorId}>{error}</FieldError>
        </Field>
      </FieldGroup>
      <div>
        <Button
          type="submit"
          disabled={submitting || name.trim() === currentName}
        >
          {submitting ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden />
              {t("savingButton")}
            </>
          ) : (
            t("saveChangesButton")
          )}
        </Button>
      </div>
    </form>
  );
}
