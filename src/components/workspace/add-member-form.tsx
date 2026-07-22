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
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, workspacesApi } from "./api";
import { OperatorSearch } from "./operator-search";

interface FieldErrors {
  username?: string;
  password?: string;
}

interface AvailableOperator {
  id: string;
  username: string;
  email: string | null;
}

// AC scope: Settings > Workspace, "Add member" form (task spec item 3).
// Password is optional — the API only uses it to create a brand-new
// Operator when `username` doesn't already exist (src/lib/services/
// workspaces.ts addMember); adding an existing operator by username needs
// no password.
export function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("workspace");
  const router = useRouter();
  const usernameId = useId();
  const passwordId = useId();
  const usernameErrorId = useId();
  const passwordErrorId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);

  async function handleSelectExisting(operator: AvailableOperator) {
    setAdding(true);
    try {
      await workspacesApi.addMember(workspaceId, {
        username: operator.username,
      });
      toast.success(t("memberAddedToast"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("addMemberError"));
    } finally {
      setAdding(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErrors({ username: t("usernameRequiredError") });
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      await workspacesApi.addMember(workspaceId, {
        username: trimmedUsername,
        password: password.trim() || undefined,
      });
      toast.success(t("memberAddedToast"));
      setUsername("");
      setPassword("");
      router.refresh();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({
          username: err.fieldErrors.username,
          password: err.fieldErrors.password,
        });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("addMemberError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel>{t("searchOperatorLabel")}</FieldLabel>
        <OperatorSearch
          workspaceId={workspaceId}
          onSelect={handleSelectExisting}
          disabled={adding}
        />
      </Field>

      <FieldSeparator>{t("orCreateNew")}</FieldSeparator>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t("createNewOperatorTitle")}</p>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <FieldGroup className="sm:flex-row sm:items-end">
            <Field
              className="flex-1"
              data-invalid={!!errors.username || undefined}
            >
              <FieldLabel htmlFor={usernameId}>
                {t("usernameLabel")}
              </FieldLabel>
              <Input
                id={usernameId}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.username || undefined}
                aria-describedby={errors.username ? usernameErrorId : undefined}
              />
              <FieldError id={usernameErrorId}>{errors.username}</FieldError>
            </Field>
            <Field
              className="flex-1"
              data-invalid={!!errors.password || undefined}
            >
              <FieldLabel htmlFor={passwordId}>
                {t("passwordLabel")}
              </FieldLabel>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={!!errors.password || undefined}
                aria-describedby={errors.password ? passwordErrorId : undefined}
              />
              <FieldError id={passwordErrorId}>{errors.password}</FieldError>
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("addingButton")}
                </>
              ) : (
                t("addMemberButton")
              )}
            </Button>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
