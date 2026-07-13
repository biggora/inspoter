"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ApiError,
  webhookTokensApi,
  type CreatedWebhookTokenDto,
  type WebhookTokenDto,
} from "./webhook-tokens-api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Settings > Webhooks — token list + create/revoke (design.md §6.7.1,
// AC-WH-008/009). Client-fetched (no server-component data hand-off) since
// the raw secret must never round-trip through a server-rendered prop.
export function WebhookTokensView() {
  const [tokens, setTokens] = useState<WebhookTokenDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] =
    useState<CreatedWebhookTokenDto | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<WebhookTokenDto | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);

  const nameId = useId();
  const nameErrorId = useId();

  // All setState calls live in the promise continuations (never
  // synchronously as soon as `load()` runs), so calling it from the mount
  // effect below isn't flagged as a synchronous setState-in-effect
  // (react-hooks/set-state-in-effect) — matches
  // src/components/domains/dns-records-view.tsx and
  // src/components/mail/mail-view.tsx.
  function load() {
    return webhookTokensApi
      .list()
      .then((data) => {
        setTokens(data);
        setError(null);
      })
      .catch(() => setError("Couldn't load webhook tokens. Try again."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setName("");
      setNameError(null);
      setCreatedToken(null);
      setCopied(false);
      load();
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name is required.");
      return;
    }
    setSubmitting(true);
    setNameError(null);
    try {
      const created = await webhookTokensApi.create(trimmed);
      setCreatedToken(created);
      toast.success("Webhook token created.");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setNameError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Couldn't create webhook token. Try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy. Select and copy the token manually.");
    }
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await webhookTokensApi.revoke(revokeTarget.id);
      toast.success("Webhook token revoked.");
      setRevokeTarget(null);
      load();
    } catch {
      toast.error("Couldn't revoke webhook token. Try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">
          Settings — Webhook tokens
        </h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden className="size-4" />
          New token
        </Button>
      </div>

      {error && (
        <p className="text-sm text-(--error-text)">{error}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No webhook tokens yet. Create one so external systems can push
            mail, messages, logs, and alerts into this workspace.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => {
              const isRevoked = token.revokedAt !== null;
              return (
                <TableRow key={token.id}>
                  <TableCell className="font-medium text-foreground">
                    {token.name}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {token.tokenPrefix}…
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(token.lastUsedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        isRevoked
                          ? "bg-muted text-muted-foreground"
                          : "bg-(--success-bg) text-(--success-text)",
                      )}
                    >
                      {isRevoked ? "Revoked" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevokeTarget(token)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent>
          {!createdToken ? (
            <>
              <DialogHeader>
                <DialogTitle>New webhook token</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={handleCreateSubmit}
                noValidate
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={nameId}>Name</Label>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder='e.g. "CI pipeline"'
                    aria-required="true"
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={nameError ? nameErrorId : undefined}
                    autoFocus
                  />
                  {nameError && (
                    <p id={nameErrorId} className="text-sm text-(--error-text)">
                      {nameError}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" type="button" />}
                  >
                    Cancel
                  </DialogClose>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Token created</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-(--warning-text)">
                  Copy this token now — it will not be shown again.
                </p>
                <div className="rounded-md border border-border bg-(--bg-sunken) p-3">
                  <code className="block break-all font-mono text-sm text-foreground">
                    {createdToken.token}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check aria-hidden className="size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" />}>
                  Done
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke &ldquo;{revokeTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any requests using this token will be rejected immediately.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
