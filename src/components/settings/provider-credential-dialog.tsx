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
  ApiError,
  credentialsApi,
  type CredentialDto,
  type ProviderType,
} from "./credentials-api";

export interface ProviderDefinition {
  provider: ProviderType;
  name: string;
  defaultLabel: string;
  secretKind: "token" | "godaddy";
}

interface ProviderCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderDefinition;
  existing: CredentialDto | null;
  onSaved: () => void;
}

export function ProviderCredentialDialog({
  open,
  onOpenChange,
  provider,
  existing,
  onSaved,
}: ProviderCredentialDialogProps) {
  // Rendered only while a dialog is open (see provider-credentials-view.tsx's
  // `dialogProvider && (...)` guard), so it fully remounts on each open —
  // these initial values don't need to be re-synced via an effect.
  const [label, setLabel] = useState(existing?.label ?? provider.defaultLabel);
  const [apiToken, setApiToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelId = useId();
  const tokenId = useId();
  const apiKeyId = useId();
  const apiSecretId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Название обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (provider.secretKind === "godaddy") {
        if (!apiKey.trim() || !apiSecret.trim()) {
          setError("API-ключ и API-секрет обязательны.");
          setSubmitting(false);
          return;
        }
        await credentialsApi.upsert({
          provider: "GODADDY_DNS",
          label: trimmedLabel,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
        });
      } else {
        if (!apiToken.trim()) {
          setError("API-токен обязателен.");
          setSubmitting(false);
          return;
        }
        await credentialsApi.upsert({
          provider: provider.provider as
            | "CLOUDFLARE_DNS"
            | "HETZNER_DNS"
            | "HETZNER_CLOUD",
          label: trimmedLabel,
          apiToken: apiToken.trim(),
        });
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
          <DialogTitle>Настроить {provider.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={labelId}>Название</Label>
            <Input
              id={labelId}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              autoFocus
            />
          </div>

          {provider.secretKind === "godaddy" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={apiKeyId}>API-ключ</Label>
                <Input
                  id={apiKeyId}
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={apiSecretId}>API-секрет</Label>
                <Input
                  id={apiSecretId}
                  type="password"
                  value={apiSecret}
                  onChange={(event) => setApiSecret(event.target.value)}
                  autoComplete="off"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={tokenId}>API-токен</Label>
              <Input
                id={tokenId}
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                autoComplete="off"
              />
            </div>
          )}

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
