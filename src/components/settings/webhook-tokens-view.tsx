"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingRegion } from "@/components/ui/loading";
import { TableSkeleton } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { McpScope } from "@/lib/mcp/scopes";
import { McpScopeFields } from "./mcp-scope-fields";
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
interface WebhookTokensViewProps {
  /** Absolute origin resolved from the request, for the MCP endpoint URL. */
  origin: string;
}

export function WebhookTokensView({ origin }: WebhookTokensViewProps) {
  const t = useTranslations("settings");
  const [tokens, setTokens] = useState<WebhookTokenDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] =
    useState<CreatedWebhookTokenDto | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopes, setScopes] = useState<McpScope[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [scopesTarget, setScopesTarget] = useState<WebhookTokenDto | null>(
    null,
  );
  const [editedScopes, setEditedScopes] = useState<McpScope[]>([]);
  const [savingScopes, setSavingScopes] = useState(false);

  const mcpEndpoint = `${origin}/api/mcp`;

  const [revokeTarget, setRevokeTarget] = useState<WebhookTokenDto | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);

  const [rotateTarget, setRotateTarget] = useState<WebhookTokenDto | null>(
    null,
  );
  const [rotating, setRotating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WebhookTokenDto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const nameId = useId();
  const nameErrorId = useId();

  // All setState calls live in the promise continuations (never
  // synchronously as soon as `load()` runs), so calling it from the mount
  // effect below isn't flagged as a synchronous setState-in-effect
  // (react-hooks/set-state-in-effect) — matches
  // src/components/domains/dns-records-view.tsx and
  // src/components/mail/mail-view.tsx.
  const load = useCallback(() => {
    return webhookTokensApi
      .list()
      .then((data) => {
        setTokens(data);
        setError(null);
      })
      .catch(() => setError(t("loadWebhookTokensError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setName("");
      setNameError(null);
      setScopes([]);
      setCreatedToken(null);
      setCopied(false);
      load();
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("nameRequiredError"));
      return;
    }
    setSubmitting(true);
    setNameError(null);
    try {
      const created = await webhookTokensApi.create(trimmed, scopes);
      setCreatedToken(created);
      toast.success(t("tokenCreatedToast"));
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setNameError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("createTokenError"),
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
      toast.success(t("copiedToClipboardToast"));
    } catch {
      toast.error(t("copyFailedError"));
    }
  }

  async function handleCopyEndpoint() {
    try {
      await navigator.clipboard.writeText(mcpEndpoint);
      toast.success(t("copiedToClipboardToast"));
    } catch {
      toast.error(t("copyFailedError"));
    }
  }

  function openScopesDialog(token: WebhookTokenDto) {
    setScopesTarget(token);
    setEditedScopes(token.scopes);
  }

  async function handleScopesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scopesTarget) return;
    setSavingScopes(true);
    try {
      await webhookTokensApi.updateScopes(scopesTarget.id, editedScopes);
      toast.success(t("scopesUpdatedToast"));
      setScopesTarget(null);
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("updateScopesError"),
      );
    } finally {
      setSavingScopes(false);
    }
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await webhookTokensApi.revoke(revokeTarget.id);
      toast.success(t("tokenRevokedToast"));
      setRevokeTarget(null);
      load();
    } catch {
      toast.error(t("revokeTokenError"));
    } finally {
      setRevoking(false);
    }
  }

  async function handleRotateConfirm() {
    if (!rotateTarget) return;
    setRotating(true);
    try {
      const rotated = await webhookTokensApi.rotate(rotateTarget.id);
      toast.success(t("tokenRotatedToast"));
      setRotateTarget(null);
      setCopied(false);
      setCreatedToken(rotated);
      setCreateOpen(true);
      load();
    } catch {
      toast.error(t("rotateTokenError"));
    } finally {
      setRotating(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await webhookTokensApi.removePermanently(deleteTarget.id);
      toast.success(t("tokenDeletedToast"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteTokenError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t("webhookTokensTitle")}
        back={{ href: "/settings", label: t("backToSettings") }}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("newTokenButton")}
          </Button>
        }
      />

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-background-200 bg-background-50 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-foreground">{t("mcpTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("mcpDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-(--bg-sunken) px-2 py-1 font-mono text-sm break-all text-foreground">
            {mcpEndpoint}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyEndpoint}
          >
            <Icon
              name="ri-file-copy-line"
              aria-hidden
              data-icon="inline-start"
            />
            {t("copyButton")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("mcpAuthHint")}</p>
      </section>

      {loading ? (
        <LoadingRegion>
          <TableSkeleton rows={3} />
        </LoadingRegion>
      ) : tokens.length === 0 ? (
        <EmptyState
          icon="ri-links-line"
          title={t("emptyTokensTitle")}
          description={t("emptyTokensDescription")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("prefixHeader")}</TableHead>
              <TableHead>{t("scopesHeader")}</TableHead>
              <TableHead>{t("createdHeader")}</TableHead>
              <TableHead>{t("lastUsedHeader")}</TableHead>
              <TableHead>{t("statusHeader")}</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
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
                  <TableCell>
                    {token.scopes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {t("scopesWebhookOnly")}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(token.lastUsedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusIndicator status={isRevoked ? "revoked" : "up"} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isRevoked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(token)}
                      >
                        {t("deleteButton")}
                      </Button>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openScopesDialog(token)}
                        >
                          {t("editScopesButton")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRotateTarget(token)}
                        >
                          {t("rotateButton")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokeTarget(token)}
                        >
                          {t("revokeButton")}
                        </Button>
                      </div>
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
                <DialogTitle>{t("newWebhookTokenTitle")}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={handleCreateSubmit}
                noValidate
                className="flex flex-col gap-4"
              >
                <FieldGroup>
                  <Field data-invalid={!!nameError || undefined}>
                    <FieldLabel htmlFor={nameId}>{t("nameLabel")}</FieldLabel>
                    <Input
                      id={nameId}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("tokenNamePlaceholder")}
                      aria-required="true"
                      aria-invalid={!!nameError || undefined}
                      aria-describedby={nameError ? nameErrorId : undefined}
                      autoFocus
                    />
                    <FieldError id={nameErrorId}>{nameError}</FieldError>
                  </Field>
                  <McpScopeFields value={scopes} onChange={setScopes} />
                </FieldGroup>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" type="button" />}
                  >
                    {t("cancelButton")}
                  </DialogClose>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner data-icon="inline-start" aria-hidden />
                        {t("creatingLabel")}
                      </>
                    ) : (
                      t("createButton")
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("tokenCreatedTitle")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-(--warning-text)">
                  {t("copyTokenWarning")}
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
                    <Icon
                      name="ri-check-line"
                      aria-hidden
                      className="text-base"
                    />
                  ) : (
                    <Icon
                      name="ri-file-copy-line"
                      aria-hidden
                      className="text-base"
                    />
                  )}
                  {copied ? t("copiedLabel") : t("copyButton")}
                </Button>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" />}>
                  {t("doneButton")}
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={scopesTarget !== null}
        onOpenChange={(open) => !open && setScopesTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("editScopesTitle", { name: scopesTarget?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleScopesSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <McpScopeFields value={editedScopes} onChange={setEditedScopes} />
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancelButton")}
              </DialogClose>
              <Button type="submit" disabled={savingScopes}>
                {savingScopes ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    {t("savingLabel")}
                  </>
                ) : (
                  t("saveButton")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("revokeConfirmTitle", { name: revokeTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revoking}
            >
              {revoking ? t("revokingLabel") : t("revokeButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rotateTarget !== null}
        onOpenChange={(open) => !open && setRotateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("rotateConfirmTitle", { name: rotateTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("rotateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRotateConfirm}
              disabled={rotating}
            >
              {rotating ? t("rotatingLabel") : t("rotateButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteTokenConfirmTitle", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteTokenConfirmDescription")}
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
