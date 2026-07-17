"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

const CATEGORY_LABELS: Record<"DNS" | "HOSTING", string> = {
  DNS: "DNS",
  HOSTING: "Хостинг",
};

const FIELD_LABELS: Record<string, string> = {
  apiToken: "API-токен",
  apiKey: "API-ключ",
  apiSecret: "API-секрет",
};

const PROVIDER_OPTIONS = (Object.keys(PROVIDER_REGISTRY) as ProviderType[]).map(
  (provider) => ({ provider, ...PROVIDER_REGISTRY[provider] }),
);

const PROVIDER_SELECT_ITEMS = [
  { label: "Выберите провайдера", value: null },
  ...PROVIDER_OPTIONS.map((option) => ({
    label: `${option.label} (${CATEGORY_LABELS[option.category]})`,
    value: option.provider,
  })),
];

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
  // Rendered only while a dialog is open (see provider-credentials-view.tsx's
  // guard), so it fully remounts on each open — these initial values don't
  // need to be re-synced via an effect.
  const [provider, setProvider] = useState<ProviderType | "">(
    mode === "edit" ? existing!.provider : "",
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const labelId = useId();
  const providerId = useId();
  const fieldBaseId = useId();
  const globalErrorId = useId();

  const activeFields = provider ? PROVIDER_REGISTRY[provider].fields : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!provider) {
      setErrors({ provider: "Выберите провайдера." });
      return;
    }
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrors({ label: "Название обязательно." });
      return;
    }
    for (const field of activeFields) {
      if (!secrets[field]?.trim()) {
        setErrors({
          [field]: `Поле «${FIELD_LABELS[field] ?? field}» обязательно.`,
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
    } as UpsertCredentialInput;

    setSubmitting(true);
    setErrors({});
    try {
      if (mode === "create") {
        await credentialsApi.create(payload);
      } else {
        await credentialsApi.update(existing!.id, payload);
      }
      toast.success("Учётные данные сохранены.");
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
                  : "Не удалось сохранить учётные данные. Попробуйте снова.",
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
              ? "Добавить провайдера"
              : `Изменить «${existing?.label}»`}
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
              <FieldLabel htmlFor={providerId}>Провайдер</FieldLabel>
              <Select
                value={provider || null}
                onValueChange={(value) =>
                  setProvider((value ?? "") as ProviderType | "")
                }
                items={PROVIDER_SELECT_ITEMS}
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
                        {option.label} ({CATEGORY_LABELS[option.category]})
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
              <FieldLabel htmlFor={labelId}>Название</FieldLabel>
              <Input
                id={labelId}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder='например, "Основной аккаунт"'
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
                    {FIELD_LABELS[field] ?? field}
                  </FieldLabel>
                  <Input
                    id={fieldId}
                    type="password"
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
          </FieldGroup>

          {errors.global && (
            <Alert id={globalErrorId} variant="error">
              <AlertDescription>{errors.global}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  Сохранение…
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
