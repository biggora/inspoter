"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
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
import { ApiError, boardsApi } from "./api";

export type BoardDialogState =
  { mode: "create" } | { mode: "rename"; board: { id: string; name: string } };

interface BoardDialogProps {
  state: BoardDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function BoardDialog({
  state,
  onOpenChange,
  onSaved,
}: BoardDialogProps) {
  const t = useTranslations("kanban");
  const nameId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Reset on target change during render rather than in an effect — the same
  // pattern the bookmark and dashboard dialogs use.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setName(state?.mode === "rename" ? state.board.name : "");
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("errors.LABEL_NAME_REQUIRED"));
      return;
    }

    setSubmitting(true);
    try {
      if (state?.mode === "rename") {
        await boardsApi.rename(state.board.id, trimmed);
      } else {
        await boardsApi.create(trimmed);
      }
      toast.success(t("updatedToast"));
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(t("genericError"));
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
            {state?.mode === "rename"
              ? t("boardDialogEditTitle")
              : t("boardDialogCreateTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>{t("boardNameLabel")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("boardNamePlaceholder")}
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
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {t("saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
