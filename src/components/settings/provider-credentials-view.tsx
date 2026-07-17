"use client";

import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import { credentialsApi, type CredentialDto } from "./credentials-api";
import { ProviderCredentialDialog } from "./provider-credential-dialog";

const CATEGORY_LABELS: Record<"DNS" | "HOSTING", string> = {
  DNS: "DNS",
  HOSTING: "Хостинг",
};

type DialogState =
  { mode: "create" } | { mode: "edit"; credential: CredentialDto };

// Settings > Providers — dynamic list of all configured credentials
// (multiple accounts per provider type allowed) + add/edit/delete. Client-
// fetched (no server-component data hand-off) since secrets must never
// round-trip through a server-rendered prop, matching
// src/components/settings/webhook-tokens-view.tsx.
export function ProviderCredentialsView() {
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialDto | null>(null);
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
      await credentialsApi.remove(deleteTarget.id);
      toast.success("Провайдер удалён.");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Не удалось удалить провайдера. Попробуйте снова.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Провайдеры"
        back={{ href: "/settings", label: "Назад к настройкам" }}
        actions={
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Plus aria-hidden className="size-4" />
            Добавить провайдер
          </Button>
        }
      />

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          description="Провайдеры не настроены. Добавьте API-ключи для подключения к Cloudflare, Hetzner или GoDaddy."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Провайдер</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Ключ</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.map((credential) => {
              const meta = PROVIDER_REGISTRY[credential.provider];
              return (
                <TableRow key={credential.id}>
                  <TableCell className="font-medium text-foreground">
                    {meta.label}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {credential.label}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {credential.maskedHint}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CATEGORY_LABELS[meta.category]}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Изменить"
                        onClick={() =>
                          setDialogState({ mode: "edit", credential })
                        }
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить"
                        onClick={() => setDeleteTarget(credential)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialogState && (
        <ProviderCredentialDialog
          open={dialogState !== null}
          onOpenChange={(open) => !open && setDialogState(null)}
          mode={dialogState.mode}
          existing={dialogState.mode === "edit" ? dialogState.credential : null}
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
              Удалить провайдер «{deleteTarget?.label}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Связанные домены и серверы потеряют доступ к этому аккаунту. Это
              действие нельзя отменить.
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
    </PageBody>
  );
}
