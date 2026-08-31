"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "./management-shared";

interface CreateDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
}

// "Record a decision" sits behind the header CTA, not on the fold: reading
// the operating picture precedes writing on this surface (critique
// 2026-08-31, P2: the write-form owned the fold).
export function CreateDecisionDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateDecisionDialogProps) {
  const t = useTranslations("management");
  const titleId = useId();
  const contextId = useId();
  const priorityId = useId();
  const errorId = useId();
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset on reopen — a one-shot capture form, not a persistent draft.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setTitle("");
    setContext("");
    setPriority("MEDIUM");
    setError(null);
  }
  if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("fieldTitleRequiredError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestJson("/api/management/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: trimmed,
          context: context || null,
          priority,
        }),
      });
      toast.success(t("decisionCreatedToast"));
      onOpenChange(false);
      await onCreated();
    } catch {
      toast.error(t("createDecisionError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={titleId}>{t("fieldTitle")}</FieldLabel>
              <Input
                id={titleId}
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={contextId}>{t("fieldContext")}</FieldLabel>
              <Textarea
                id={contextId}
                value={context}
                maxLength={4000}
                rows={5}
                onChange={(event) => setContext(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={priorityId}>{t("fieldPriority")}</FieldLabel>
              <NativeSelect
                id={priorityId}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <NativeSelectOption value="LOW">
                  {t("priorityLow")}
                </NativeSelectOption>
                <NativeSelectOption value="MEDIUM">
                  {t("priorityMedium")}
                </NativeSelectOption>
                <NativeSelectOption value="HIGH">
                  {t("priorityHigh")}
                </NativeSelectOption>
                <NativeSelectOption value="CRITICAL">
                  {t("priorityCritical")}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("saving")}
                </>
              ) : (
                t("createAction")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
