"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, workspacesApi } from "./api";

export function TimeZoneForm({
  workspaceId,
  currentTimeZone,
}: {
  workspaceId: string;
  currentTimeZone: string;
}) {
  const t = useTranslations("workspace");
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(currentTimeZone);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await workspacesApi.setTimeZone(workspaceId, timeZone);
      toast.success(t("timeZoneSavedToast"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("timeZoneSaveError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="workspace-time-zone">
          {t("timeZoneLabel")}
        </FieldLabel>
        <Input
          id="workspace-time-zone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder="Europe/Riga"
          autoComplete="off"
          required
        />
        <FieldDescription>{t("timeZoneHint")}</FieldDescription>
      </Field>
      <div>
        <Button
          type="submit"
          disabled={submitting || timeZone === currentTimeZone}
        >
          {submitting && <Spinner data-icon="inline-start" aria-hidden />}
          {submitting ? t("savingButton") : t("saveChangesButton")}
        </Button>
      </div>
    </form>
  );
}
