"use client";

import { useId, useState, type FormEvent } from "react";
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
import { useRouter } from "@/i18n/navigation";
import { ApiError, workspacesApi } from "./api";

// AC scope: Settings > Workspace, "Create new workspace" section (task spec
// item 4). Creating opens the new workspace in this tab, on its own
// workspace settings page (design.md §4.3); the workspace lives in the URL, so
// no session-wide switch is needed.
export function CreateWorkspaceForm() {
  const t = useTranslations("workspace");
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
      setError(t("nameRequiredError"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const workspace = await workspacesApi.create(trimmed);
      toast.success(t("createdToast"));
      setName("");
      router.push(`/w/${workspace.slug}/settings/workspace`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(err instanceof ApiError ? err.message : t("createError"));
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
          <FieldLabel htmlFor={nameId}>{t("newWorkspaceNameLabel")}</FieldLabel>
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
              {t("creatingButton")}
            </>
          ) : (
            t("createWorkspaceButton")
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
