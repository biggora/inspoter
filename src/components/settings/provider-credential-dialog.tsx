"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import {
  ApiError,
  credentialsApi,
  type CredentialDto,
  type ProviderType,
  type UpsertCredentialInput,
} from "./credentials-api";

// "DNS" isn't Russian prose so it stays as a plain literal string; "Хостинг"
// does need translation and holds a translation key instead, resolved via
// categoryLabel() below (same convention as services/format.ts's
// MONITOR_TYPE_LABELS/getMonitorTypeLabel).
const CATEGORY_LABELS: Record<"DNS" | "HOSTING", string> = {
  DNS: "DNS",
  HOSTING: "categoryHosting",
};

function categoryLabel(
  category: "DNS" | "HOSTING",
  t: (key: string) => string,
): string {
  return category === "HOSTING"
    ? t(CATEGORY_LABELS.HOSTING)
    : CATEGORY_LABELS.DNS;
}

// Holds translation keys, resolved via fieldLabel() below (same "store the
// key in the map, resolve with t() at render" convention as
// services/format.ts's MONITOR_TYPE_LABELS).
const FIELD_LABEL_KEYS: Record<string, string> = {
  apiToken: "fieldApiToken",
  apiKey: "fieldApiKey",
  apiSecret: "fieldApiSecret",
  hostname: "fieldHostname",
  username: "fieldUsername",
  allowInsecure: "fieldAllowInsecure",
};

// Non-secret fields (host/username) render as plain text; secrets as password.
const SECRET_FIELDS = new Set(["apiToken", "apiKey", "apiSecret"]);

function fieldLabel(field: string, t: (key: string) => string): string {
  const key = FIELD_LABEL_KEYS[field];
  return key ? t(key) : field;
}

const PROVIDER_OPTIONS = (Object.keys(PROVIDER_REGISTRY) as ProviderType[]).map(
  (provider) => ({ provider, ...PROVIDER_REGISTRY[provider] }),
);

interface ProviderCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  existing: CredentialDto | null;
  onSaved: () => void;
}

// Settings > Providers — create/edit dialog. Provider type is fixed once a
// credential exists (dropdown disabled in edit mode); secret fields are
// rendered dynamically from PROVIDER_REGISTRY[provider].fields and always
// start empty in edit mode since secrets never round-trip from the server.
export function ProviderCredentialDialog({
  open,
  onOpenChange,
  mode,
  existing,
  onSaved,
}: ProviderCredentialDialogProps) {
  const t = useTranslations("settings");

  // Rendered only while a dialog is open (see provider-credentials-view.tsx's
  // guard), so it fully remounts on each open — these initial values don't
  // need to be re-synced via an effect.
  const [provider, setProvider] = useState<ProviderType | "">(
    mode === "edit" ? existing!.provider : "",
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>(
    mode === "edit"
      ? Object.fromEntries(
          (PROVIDER_REGISTRY[existing!.provider].booleanFields ?? []).map(
            (field) => [
              field,
              field === "allowInsecure" ? existing!.allowInsecure : false,
            ],
          ),
        )
      : {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const labelId = useId();
  const providerId = useId();
  const fieldBaseId = useId();
  const globalErrorId = useId();

  const activeFields = provider ? PROVIDER_REGISTRY[provider].fields : [];
  const activeBooleanFields = provider
    ? (PROVIDER_REGISTRY[provider].booleanFields ?? [])
    : [];

  const providerSelectItems = [
    { label: t("selectProviderPlaceholder"), value: null },
    ...PROVIDER_OPTIONS.map((option) => ({
      label: `${option.label} (${categoryLabel(option.category, t)})`,
      value: option.provider,
    })),
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!provider) {
      setErrors({ provider: t("selectProviderError") });
      return;
    }
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrors({ label: t("nameRequiredError") });
      return;
    }
    for (const field of activeFields) {
      if (!secrets[field]?.trim()) {
        setErrors({
          [field]: t("fieldRequiredError", { field: fieldLabel(field, t) }),
        });
        return;
      }
    }

    const payload = {
      provider,
      label: trimmedLabel,
      ...Object.fromEntries(
        activeFields.map((field) => [field, secrets[field].trim()]),
      ),
      ...Object.fromEntries(
        activeBooleanFields.map((field) => [field, flags[field] ?? false]),
      ),
    } as UpsertCredentialInput;

    setSubmitting(true);
    setErrors({});
    try {
      if (mode === "create") {
        await credentialsApi.create(payload);
      } else {
        await credentialsApi.update(existing!.id, payload);
      }
      toast.success(t("credentialsSavedToast"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setErrors(
        err instanceof ApiError &&
          err.fieldErrors &&
          Object.keys(err.fieldErrors).length > 0
          ? err.fieldErrors
          : {
              global:
                err instanceof ApiError
                  ? err.message
                  : t("saveCredentialsError"),
            },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? t("addProviderTitle")
              : t("editProviderTitle", { label: existing?.label ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field
              data-disabled={mode === "edit" || undefined}
              data-invalid={!!errors.provider || undefined}
            >
              <FieldLabel htmlFor={providerId}>{t("providerLabel")}</FieldLabel>
              <Select
                value={provider || null}
                onValueChange={(value) =>
                  setProvider((value ?? "") as ProviderType | "")
                }
                items={providerSelectItems}
                disabled={mode === "edit"}
              >
                <SelectTrigger
                  id={providerId}
                  className="w-full"
                  aria-invalid={!!errors.provider || undefined}
                  aria-describedby={
                    errors.provider ? `${providerId}-error` : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.provider} value={option.provider}>
                        {option.label} ({categoryLabel(option.category, t)})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError id={`${providerId}-error`}>
                {errors.provider}
              </FieldError>
            </Field>

            <Field data-invalid={!!errors.label || undefined}>
              <FieldLabel htmlFor={labelId}>{t("nameLabel")}</FieldLabel>
              <Input
                id={labelId}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus={mode === "edit"}
                aria-invalid={!!errors.label || undefined}
                aria-describedby={errors.label ? `${labelId}-error` : undefined}
              />
              <FieldError id={`${labelId}-error`}>{errors.label}</FieldError>
            </Field>

            {activeFields.map((field) => {
              const fieldId = `${fieldBaseId}-${field}`;
              const message = errors[field];

              return (
                <Field key={field} data-invalid={!!message || undefined}>
                  <FieldLabel htmlFor={fieldId}>
                    {fieldLabel(field, t)}
                  </FieldLabel>
                  <Input
                    id={fieldId}
                    type={SECRET_FIELDS.has(field) ? "password" : "text"}
                    value={secrets[field] ?? ""}
                    onChange={(event) =>
                      setSecrets((prev) => ({
                        ...prev,
                        [field]: event.target.value,
                      }))
                    }
                    autoComplete="off"
                    aria-invalid={!!message || undefined}
                    aria-describedby={message ? `${fieldId}-error` : undefined}
                  />
                  <FieldError id={`${fieldId}-error`}>{message}</FieldError>
                </Field>
              );
            })}

            {activeBooleanFields.map((field) => {
              const fieldId = `${fieldBaseId}-${field}`;

              return (
                <Field key={field} orientation="horizontal">
                  <Checkbox
                    id={fieldId}
                    checked={flags[field] ?? false}
                    onCheckedChange={(value) =>
                      setFlags((prev) => ({ ...prev, [field]: value === true }))
                    }
                  />
                  <FieldContent>
                    <FieldLabel
                      htmlFor={fieldId}
                      className="cursor-pointer font-normal"
                    >
                      {fieldLabel(field, t)}
                    </FieldLabel>
                    <FieldDescription>
                      {t("allowInsecureHelpText")}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              );
            })}
          </FieldGroup>

          {errors.global && (
            <Alert id={globalErrorId} variant="error">
              <AlertDescription>{errors.global}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("savingLabel")}
                </>
              ) : (
                t("saveButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
