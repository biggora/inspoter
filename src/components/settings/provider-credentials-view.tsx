"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { credentialsApi, type CredentialDto } from "./credentials-api";
import {
  ProviderCredentialDialog,
  type ProviderDefinition,
} from "./provider-credential-dialog";

const PROVIDERS: ProviderDefinition[] = [
  {
    provider: "CLOUDFLARE_DNS",
    name: "Cloudflare DNS",
    defaultLabel: "Cloudflare DNS",
    secretKind: "token",
  },
  {
    provider: "HETZNER_DNS",
    name: "Hetzner DNS",
    defaultLabel: "Hetzner DNS",
    secretKind: "token",
  },
  {
    provider: "HETZNER_CLOUD",
    name: "Hetzner Cloud",
    defaultLabel: "Hetzner Cloud",
    secretKind: "token",
  },
  {
    provider: "GODADDY_DNS",
    name: "GoDaddy DNS",
    defaultLabel: "GoDaddy DNS",
    secretKind: "godaddy",
  },
];

// Settings > Providers — API credential list + configure/delete per provider.
// Client-fetched (no server-component data hand-off) since secrets must
// never round-trip through a server-rendered prop, matching
// src/components/settings/webhook-tokens-view.tsx.
export function ProviderCredentialsView() {
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogProvider, setDialogProvider] =
    useState<ProviderDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialDto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  function load() {
    return credentialsApi
      .list()
      .then((data) => {
        setCredentials(data);
        setError(null);
      })
      .catch(() =>
        setError("Не удалось загрузить учётные данные. Попробуйте снова."),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await credentialsApi.remove(deleteTarget.provider);
      toast.success("Учётные данные удалены.");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Не удалось удалить учётные данные. Попробуйте снова.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">
        Настройки — Провайдеры
      </h1>

      {error && <p className="text-sm text-(--error-text)">{error}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const credential =
              credentials.find((c) => c.provider === provider.provider) ??
              null;
            return (
              <div
                key={provider.provider}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="size-5 text-muted-foreground" />
                  <p className="font-medium text-foreground">
                    {provider.name}
                  </p>
                </div>

                {credential ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {credential.label}
                      </p>
                      <span className="font-mono text-sm text-muted-foreground">
                        {credential.maskedHint}
                      </span>
                    </div>
                    {credential.isValid !== null && (
                      <Badge
                        className={cn(
                          "w-fit",
                          credential.isValid
                            ? "bg-(--success-bg) text-(--success-text)"
                            : "bg-(--error-bg) text-(--error-text)",
                        )}
                      >
                        {credential.isValid ? "Действителен" : "Недействителен"}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Не настроен</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogProvider(provider)}
                  >
                    {credential ? "Изменить" : "Настроить"}
                  </Button>
                  {credential && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(credential)}
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogProvider && (
        <ProviderCredentialDialog
          open={dialogProvider !== null}
          onOpenChange={(open) => !open && setDialogProvider(null)}
          provider={dialogProvider}
          existing={
            credentials.find((c) => c.provider === dialogProvider.provider) ??
            null
          }
          onSaved={load}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить учётные данные «{deleteTarget?.label}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Все операции, использующие эти учётные данные, перестанут
              работать. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
