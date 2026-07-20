"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
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
import {
  ApiError,
  backupErrorMessage,
  importBackup,
  type BackupImportMode,
  type ImportSummary,
} from "./api";

// Settings > Backup, import form. "replace" is gated behind a destructive
// AlertDialog confirm (data loss); "merge" (the safe default) submits
// directly. Success renders an inline summary rather than only a toast,
// since import touches a variable number of models across sections.
export function ImportForm() {
  const t = useTranslations("backup");
  const router = useRouter();
  const fileId = useId();
  const modeId = useId();
  const passphraseId = useId();
  const passphraseErrorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<BackupImportMode>("merge");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function submitImport() {
    if (!file) return;
    setSubmitting(true);
    setPassphraseError(null);
    setSummary(null);
    try {
      const result = await importBackup(file, mode, passphrase);
      setSummary(result);
      toast.success(t("importSuccessToast"));
      setPassphrase("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.passphrase) {
        setPassphraseError(err.fieldErrors.passphrase);
      } else {
        toast.error(backupErrorMessage(err, t));
      }
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || passphrase.length === 0) return;
    if (mode === "replace") {
      setConfirmOpen(true);
      return;
    }
    void submitImport();
  }

  const importedEntries = summary
    ? Object.entries(summary.imported).filter(([, count]) => count > 0)
    : [];
  const hasSkipped =
    !!summary &&
    (summary.skipped.webhookTokens > 0 ||
      summary.skipped.providerResourceBindings > 0);

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={fileId}>{t("fileLabel")}</FieldLabel>
            <Input
              id={fileId}
              ref={fileInputRef}
              type="file"
              accept=".inspot-backup"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setSummary(null);
              }}
              aria-required="true"
            />
            <FieldDescription>
              {file ? file.name : t("fileHint")}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={modeId}>{t("modeLabel")}</FieldLabel>
            <NativeSelect
              id={modeId}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as BackupImportMode);
                setSummary(null);
              }}
            >
              <NativeSelectOption value="merge">
                {t("modeMergeOption")}
              </NativeSelectOption>
              <NativeSelectOption value="replace">
                {t("modeReplaceOption")}
              </NativeSelectOption>
            </NativeSelect>
            <FieldDescription>
              {mode === "replace"
                ? t("modeReplaceDescription")
                : t("modeMergeDescription")}
            </FieldDescription>
          </Field>

          <Field data-invalid={!!passphraseError || undefined}>
            <FieldLabel htmlFor={passphraseId}>
              {t("passphraseLabel")}
            </FieldLabel>
            <Input
              id={passphraseId}
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => {
                setPassphrase(event.target.value);
                setSummary(null);
              }}
              aria-required="true"
              aria-invalid={!!passphraseError || undefined}
              aria-describedby={passphraseError ? passphraseErrorId : undefined}
            />
            <FieldError id={passphraseErrorId}>{passphraseError}</FieldError>
          </Field>
        </FieldGroup>

        <div>
          <Button
            type="submit"
            disabled={submitting || !file || passphrase.length === 0}
          >
            {submitting ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden />
                {t("importingButton")}
              </>
            ) : (
              t("importButton")
            )}
          </Button>
        </div>
      </form>

      {summary && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] p-3 text-sm">
          <p className="font-medium">{t("summaryTitle")}</p>
          <ul className="flex flex-col gap-1">
            {importedEntries.map(([key, count]) => (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {t(`models.${key}`)}
                </span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
          </ul>
          {hasSkipped && (
            <>
              <p className="mt-1 font-medium">{t("skippedTitle")}</p>
              <ul className="flex flex-col gap-1">
                {summary.skipped.webhookTokens > 0 && (
                  <li className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span>{t("skippedWebhookTokens")}</span>
                    <span>{summary.skipped.webhookTokens}</span>
                  </li>
                )}
                {summary.skipped.providerResourceBindings > 0 && (
                  <li className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span>{t("skippedProviderResourceBindings")}</span>
                    <span>{summary.skipped.providerResourceBindings}</span>
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("replaceConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void submitImport()}
              disabled={submitting}
            >
              {submitting ? t("importingButton") : t("replaceConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
