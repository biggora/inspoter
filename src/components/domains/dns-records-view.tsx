"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
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
            : "Couldn't load DNS records. Try again.",
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
      toast.success("DNS record deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete DNS record. Try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm"
        >
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Domains
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono text-foreground">{domainName}</span>
        </nav>
        <Button
          size="sm"
          onClick={() =>
            setRecordDialog({ mode: "create", providerId, domainId })
          }
        >
          <Plus aria-hidden className="size-4" />
          Add record
        </Button>
      </div>

      {error && (
        <Alert className="border-(--error-bg) bg-(--error-bg)">
          <AlertDescription className="text-(--error-text)">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : records.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No DNS records for this domain yet.
          </p>
        </div>
      ) : records.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>TTL</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteTarget(record)}
                    >
                      Delete
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
              Delete this {deleteTarget?.type} record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{deleteTarget?.name}&rdquo; from{" "}
              {domainName}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
