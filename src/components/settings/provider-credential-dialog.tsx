"use client";

import { useId, useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [error, setError] = useState<string | null>(null);

  const labelId = useId();
  const providerId = useId();
  const fieldBaseId = useId();

  const activeFields = provider ? PROVIDER_REGISTRY[provider].fields : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!provider) {
      setError("Выберите провайдера.");
      return;
    }
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Название обязательно.");
      return;
    }
    for (const field of activeFields) {
      if (!secrets[field]?.trim()) {
        setError(`Поле «${FIELD_LABELS[field] ?? field}» обязательно.`);
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
    setError(null);
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
      setError(
        err instanceof ApiError
          ? err.message
          : "Не удалось сохранить учётные данные. Попробуйте снова.",
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={providerId}>Провайдер</Label>
            <Select
              value={provider || ""}
              onValueChange={(value) => setProvider(value as ProviderType)}
              disabled={mode === "edit"}
            >
              <SelectTrigger id={providerId} className="w-full">
                <SelectValue placeholder="Выберите провайдера" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.provider} value={option.provider}>
                    {option.label} ({CATEGORY_LABELS[option.category]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={labelId}>Название</Label>
            <Input
              id={labelId}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder='например, "Основной аккаунт"'
              autoFocus={mode === "edit"}
            />
          </div>

          {activeFields.map((field) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldBaseId}-${field}`}>
                {FIELD_LABELS[field] ?? field}
              </Label>
              <Input
                id={`${fieldBaseId}-${field}`}
                type="password"
                value={secrets[field] ?? ""}
                onChange={(event) =>
                  setSecrets((prev) => ({
                    ...prev,
                    [field]: event.target.value,
                  }))
                }
                autoComplete="off"
              />
            </div>
          ))}

          {error && <p className="text-sm text-(--error-text)">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Сохранение…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
