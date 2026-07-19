"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
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
import { mailAccountsApi, type MailAccountDto } from "./mail-accounts-api";
import { MailAccountDialog } from "./mail-account-dialog";

type DialogState =
  { mode: "create" } | { mode: "edit"; account: MailAccountDto };

function formatLastSyncAt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadges({ account }: { account: MailAccountDto }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {account.kind === "WEBHOOK" ? (
        <Badge variant="secondary">Системный</Badge>
      ) : account.isValid === true ? (
        <Badge variant="success">Подключён</Badge>
      ) : account.isValid === false ? (
        <Badge variant="error">Ошибка подключения</Badge>
      ) : (
        <Badge variant="outline">Не проверен</Badge>
      )}
      {account.syncStatus === "SYNCING" && (
        <Badge variant="info">Синхронизация…</Badge>
      )}
      {account.syncStatus === "ERROR" && (
        <Badge variant="warning" title={account.syncError ?? undefined}>
          Ошибка синхронизации
        </Badge>
      )}
    </div>
  );
}

// Settings > Mail accounts — list of IMAP accounts + the system webhook
// mailbox, with add/edit/delete (plan §5). Client-fetched (no
// server-component data hand-off) since account rows carry connection
// settings that must stay off server-rendered props, matching
// src/components/settings/provider-credentials-view.tsx.
export function MailAccountsView() {
  const [accounts, setAccounts] = useState<MailAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MailAccountDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    return mailAccountsApi
      .list()
      .then((data) => {
        setAccounts(data);
        setError(null);
      })
      .catch(() =>
        setError("Не удалось загрузить почтовые аккаунты. Попробуйте снова."),
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
      await mailAccountsApi.remove(deleteTarget.id);
      toast.success("Аккаунт удалён.");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Не удалось удалить аккаунт. Попробуйте снова.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Почтовые аккаунты"
        back={{ href: "/settings", label: "Назад к настройкам" }}
        actions={
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            Добавить аккаунт
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
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="ri-mail-line"
          title="Нет почтовых аккаунтов"
          description="Подключите IMAP/SMTP-ящик, чтобы получать и отправлять почту из панели."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Сервер</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Синхронизация</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-foreground">
                  {account.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {account.email || "—"}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {account.imapHost ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadges account={account} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatLastSyncAt(account.lastSyncAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Изменить"
                      onClick={() => setDialogState({ mode: "edit", account })}
                    >
                      <Icon name="ri-edit-line" aria-hidden className="text-base" />
                    </Button>
                    {account.kind !== "WEBHOOK" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить"
                        onClick={() => setDeleteTarget(account)}
                      >
                        <Icon name="ri-delete-bin-line" aria-hidden className="text-base" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dialogState && (
        <MailAccountDialog
          open={dialogState !== null}
          onOpenChange={(open) => !open && setDialogState(null)}
          mode={dialogState.mode}
          existing={dialogState.mode === "edit" ? dialogState.account : null}
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
              Удалить аккаунт «{deleteTarget?.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Все синхронизированные папки и письма этого аккаунта будут
              удалены из панели. Это действие нельзя отменить.
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
