"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  BACKUP_SECTIONS,
  backupErrorMessage,
  exportBackup,
  type BackupSection,
} from "./api";

interface FormErrors {
  sections?: string;
  passphrase?: string;
  confirm?: string;
}

// Settings > Backup, export form. All sections are checked by default; the
// passphrase is entered twice (no server-side echo to compare against) and
// must be at least 10 chars, matching exportBackupSchema's client-side mirror
// (src/lib/validation/backup.ts — not imported here, see api.ts's note).
export function ExportForm() {
  const t = useTranslations("backup");
  const idPrefix = useId();
  const passphraseErrorId = useId();
  const confirmErrorId = useId();

  const [sections, setSections] = useState<Set<BackupSection>>(
    () => new Set(BACKUP_SECTIONS),
  );
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function toggleSection(key: BackupSection, checked: boolean) {
    setSections((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    setErrors((prev) =>
      prev.sections ? { ...prev, sections: undefined } : prev,
    );
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (sections.size === 0) nextErrors.sections = t("sectionsRequiredError");
    if (passphrase.length < 10) {
      nextErrors.passphrase = t("passphraseTooShortError");
    } else if (passphrase !== confirmPassphrase) {
      nextErrors.confirm = t("passphraseMismatchError");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await exportBackup(passphrase, [...sections]);
      toast.success(t("exportSuccessToast"));
      setPassphrase("");
      setConfirmPassphrase("");
      setErrors({});
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
      } else {
        toast.error(backupErrorMessage(err, t));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FieldSet>
        <FieldLegend variant="label">{t("sectionsLabel")}</FieldLegend>
        <FieldGroup className="gap-3">
          {BACKUP_SECTIONS.map((key) => {
            const fieldId = `${idPrefix}-${key}`;
            return (
              <Field key={key} orientation="horizontal">
                <Checkbox
                  id={fieldId}
                  checked={sections.has(key)}
                  onCheckedChange={(value) =>
                    toggleSection(key, value === true)
                  }
                />
                <FieldLabel
                  htmlFor={fieldId}
                  className="cursor-pointer font-normal"
                >
                  {t(`sections.${key}`)}
                </FieldLabel>
              </Field>
            );
          })}
        </FieldGroup>
        <FieldError>{errors.sections}</FieldError>
      </FieldSet>

      <FieldGroup>
        <Field data-invalid={!!errors.passphrase || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-passphrase`}>
            {t("passphraseLabel")}
          </FieldLabel>
          <Input
            id={`${idPrefix}-passphrase`}
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value);
              setErrors((prev) =>
                prev.passphrase ? { ...prev, passphrase: undefined } : prev,
              );
            }}
            aria-required="true"
            aria-invalid={!!errors.passphrase || undefined}
            aria-describedby={errors.passphrase ? passphraseErrorId : undefined}
          />
          <FieldDescription>{t("passphraseHint")}</FieldDescription>
          <FieldError id={passphraseErrorId}>{errors.passphrase}</FieldError>
        </Field>
        <Field data-invalid={!!errors.confirm || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-confirm-passphrase`}>
            {t("confirmPassphraseLabel")}
          </FieldLabel>
          <Input
            id={`${idPrefix}-confirm-passphrase`}
            type="password"
            autoComplete="new-password"
            value={confirmPassphrase}
            onChange={(event) => {
              setConfirmPassphrase(event.target.value);
              setErrors((prev) =>
                prev.confirm ? { ...prev, confirm: undefined } : prev,
              );
            }}
            aria-required="true"
            aria-invalid={!!errors.confirm || undefined}
            aria-describedby={errors.confirm ? confirmErrorId : undefined}
          />
          <FieldError id={confirmErrorId}>{errors.confirm}</FieldError>
        </Field>
      </FieldGroup>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden />
              {t("exportingButton")}
            </>
          ) : (
            t("exportButton")
          )}
        </Button>
      </div>
    </form>
  );
}
