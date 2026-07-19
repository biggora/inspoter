"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import { credentialsApi, type CredentialDto } from "./credentials-api";
import { ProviderCredentialDialog } from "./provider-credential-dialog";

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

type DialogState =
  { mode: "create" } | { mode: "edit"; credential: CredentialDto };

// Settings > Providers — dynamic list of all configured credentials
// (multiple accounts per provider type allowed) + add/edit/delete. Client-
// fetched (no server-component data hand-off) since secrets must never
// round-trip through a server-rendered prop, matching
// src/components/settings/webhook-tokens-view.tsx.
export function ProviderCredentialsView() {
  const t = useTranslations("settings");
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
      .catch(() => setError(t("loadCredentialsError")))
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
      toast.success(t("providerDeletedToast"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteProviderError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t("providersTitle")}
        back={{ href: "/settings", label: t("backToSettings") }}
        actions={
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("addProviderButton")}
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
          icon="ri-key-2-line"
          title={t("emptyProvidersTitle")}
          description={t("emptyProvidersDescription")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("providerHeader")}</TableHead>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("keyHeader")}</TableHead>
              <TableHead>{t("categoryHeader")}</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
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
                    {categoryLabel(meta.category, t)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("editAria")}
                        onClick={() =>
                          setDialogState({ mode: "edit", credential })
                        }
                      >
                        <Icon
                          name="ri-edit-line"
                          aria-hidden
                          className="text-base"
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("deleteAria")}
                        onClick={() => setDeleteTarget(credential)}
                      >
                        <Icon
                          name="ri-delete-bin-line"
                          aria-hidden
                          className="text-base"
                        />
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
              {t("deleteProviderConfirmTitle", {
                label: deleteTarget?.label ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteProviderConfirmDescription")}
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
