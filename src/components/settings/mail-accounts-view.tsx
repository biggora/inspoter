"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import type { Format } from "@/lib/format/relative-time";
import { mailAccountsApi, type MailAccountDto } from "./mail-accounts-api";
import { MailAccountDialog } from "./mail-account-dialog";

type DialogState =
  { mode: "create" } | { mode: "edit"; account: MailAccountDto };

function formatLastSyncAt(value: string | null, format: Format): string {
  if (!value) return "—";
  return format.dateTime(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadges({ account }: { account: MailAccountDto }) {
  const t = useTranslations("settings");
  return (
    <div className="flex flex-wrap items-center gap-1">
      {account.kind === "WEBHOOK" ? (
        <Badge variant="secondary">{t("statusSystem")}</Badge>
      ) : account.isValid === true ? (
        <Badge variant="success">{t("statusConnected")}</Badge>
      ) : account.isValid === false ? (
        <Badge variant="error">{t("statusConnectionError")}</Badge>
      ) : (
        <Badge variant="outline">{t("statusNotChecked")}</Badge>
      )}
      {account.syncStatus === "SYNCING" && (
        <Badge variant="info">{t("statusSyncing")}</Badge>
      )}
      {account.syncStatus === "ERROR" && (
        <Badge variant="warning" title={account.syncError ?? undefined}>
          {t("statusSyncError")}
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
  const t = useTranslations("settings");
  const format = useFormatter();
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
      .catch(() => setError(t("loadMailAccountsError")))
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
      toast.success(t("accountDeletedToast"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteAccountError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t("mailAccountsTitle")}
        back={{ href: "/settings", label: t("backToSettings") }}
        actions={
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("addAccountButton")}
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
          title={t("emptyMailAccountsTitle")}
          description={t("emptyMailAccountsDescription")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("emailHeader")}</TableHead>
              <TableHead>{t("serverHeader")}</TableHead>
              <TableHead>{t("statusHeader")}</TableHead>
              <TableHead>{t("syncHeader")}</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
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
                  {formatLastSyncAt(account.lastSyncAt, format)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("editAria")}
                      onClick={() => setDialogState({ mode: "edit", account })}
                    >
                      <Icon
                        name="ri-edit-line"
                        aria-hidden
                        className="text-base"
                      />
                    </Button>
                    {account.kind !== "WEBHOOK" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("deleteAria")}
                        onClick={() => setDeleteTarget(account)}
                      >
                        <Icon
                          name="ri-delete-bin-line"
                          aria-hidden
                          className="text-base"
                        />
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
              {t("deleteAccountConfirmTitle", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteAccountConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? t("deletingLabel") : t("deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  );
}
