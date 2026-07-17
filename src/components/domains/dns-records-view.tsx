"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
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
        setError(
          err instanceof ApiError
            ? err.message
            : "Не удалось загрузить DNS-записи. Попробуйте снова.",
        );
      })
      .finally(() => setLoading(false));
  }, [providerId, domainId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecord(providerId, domainId, deleteTarget.id);
      toast.success("DNS-запись удалена.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Не удалось удалить DNS-запись. Попробуйте снова.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        back={{ onClick: onBack, label: "Домены" }}
        title={domainName}
        actions={
          <Button
            size="sm"
            onClick={() =>
              setRecordDialog({ mode: "create", providerId, domainId })
            }
          >
            <Plus aria-hidden data-icon="inline-start" />
            Добавить запись
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
          icon={FileText}
          title="Нет записей"
          description="Для этого домена пока нет DNS-записей."
        />
      ) : records.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Значение</TableHead>
              <TableHead>TTL</TableHead>
              <TableHead className="text-right">Действия</TableHead>
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
                      Изменить
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteTarget(record)}
                    >
                      Удалить
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
              Удалить эту запись {deleteTarget?.type}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Запись «{deleteTarget?.name}» будет удалена из домена {domainName}
              . Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
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
