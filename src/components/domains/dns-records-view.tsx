"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DnsRecord } from "@/lib/providers/dns/types";
import { ApiError, deleteRecord, fetchRecords } from "./api";
import {
  DnsRecordDialog,
  type DnsRecordDialogState,
} from "./dns-record-dialog";

interface DnsRecordsViewProps {
  providerId: string;
  domainId: string;
  domainName: string;
  onBack: () => void;
}

// DNS detail view (design.md §6.1, AC-DOM-004..009) — drill-in from
// "View DNS" on the domain list. Records are fetched client-side (no route
// change, per the parent DomainsView's client-state navigation) and
// re-fetched after every successful mutation.
export function DnsRecordsView({
  providerId,
  domainId,
  domainName,
  onBack,
}: DnsRecordsViewProps) {
  const t = useTranslations("domains");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordDialog, setRecordDialog] = useState<DnsRecordDialogState | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<DnsRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // setLoading/setError only run inside the .then/.catch/.finally
  // continuations (not synchronously in the function body) so this can be
  // called from the mount effect below without tripping
  // react-hooks/set-state-in-effect — the initial `loading`/`error` state
  // already covers the pre-fetch values.
  const load = useCallback(() => {
    fetchRecords(providerId, domainId)
      .then((data) => {
        setRecords(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("loadRecordsError"));
      })
      .finally(() => setLoading(false));
  }, [providerId, domainId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecord(providerId, domainId, deleteTarget.id);
      toast.success(t("deleteRecordSuccessToast"));
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("deleteRecordError"),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        back={{ onClick: onBack, label: t("pageTitle") }}
        title={domainName}
        actions={
          <Button
            size="sm"
            onClick={() =>
              setRecordDialog({ mode: "create", providerId, domainId })
            }
          >
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("addRecordButton")}
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
      ) : records.length === 0 && !error ? (
        <EmptyState
          icon="ri-file-text-line"
          title={t("emptyRecordsTitle")}
          description={t("emptyRecordsDescription")}
        />
      ) : records.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("typeLabel")}</TableHead>
              <TableHead>{t("nameLabel")}</TableHead>
              <TableHead>{t("valueLabel")}</TableHead>
              <TableHead>TTL</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.type}</TableCell>
                <TableCell className="font-mono">{record.name}</TableCell>
                <TableCell className="font-mono">{record.value}</TableCell>
                <TableCell className="font-mono">{record.ttl}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setRecordDialog({
                          mode: "edit",
                          providerId,
                          domainId,
                          record,
                        })
                      }
                    >
                      {t("editButton")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteTarget(record)}
                    >
                      {t("deleteButton")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <DnsRecordDialog
        state={recordDialog}
        onOpenChange={(open) => !open && setRecordDialog(null)}
        onSaved={() => {
          setRecordDialog(null);
          load();
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteConfirmTitle", { type: deleteTarget?.type ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription", {
                name: deleteTarget?.name ?? "",
                domainName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
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
