"use client";

import {
  useId,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  channelWebhooksApi,
  type ChannelDto,
  type ChannelWebhookDto,
} from "./api";

interface OneTimeSecret {
  url: string;
  curl: string;
}

interface ChannelSettingsDialogProps {
  channel: ChannelDto;
  onOpenChange: (open: boolean) => void;
  onRename: (channel: ChannelDto) => void;
  onDelete: (channel: ChannelDto) => void;
}

type Format = ReturnType<typeof useFormatter>;

function formatDate(iso: string | null, format: Format): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format.dateTime(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildOneTimeSecret(
  path: string,
  t: (key: string) => string,
): OneTimeSecret {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(t("invalidWebhookUrlError"));
  }
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error(t("invalidWebhookUrlError"));
  }
  const absoluteUrl = url.toString();
  return {
    url: absoluteUrl,
    curl: `curl -X POST '${absoluteUrl}' -H 'Content-Type: application/json' -d '{"content":"${t("integrationMessagePlaceholder")}"}'`,
  };
}

export function ChannelSettingsDialog({
  channel,
  onOpenChange,
  onRename,
  onDelete,
}: ChannelSettingsDialogProps) {
  const t = useTranslations("messages");
  const format = useFormatter();
  const nameId = useId();
  const nameErrorId = useId();
  const urlRef = useRef<HTMLTextAreaElement>(null);
  const curlRef = useRef<HTMLTextAreaElement>(null);
  const [webhooks, setWebhooks] = useState<ChannelWebhookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<OneTimeSecret | null>(null);
  const [copied, setCopied] = useState<"url" | "curl" | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ChannelWebhookDto | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    channelWebhooksApi
      .list(channel.id)
      .then((items) => {
        if (!cancelled) {
          setWebhooks(items);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(t("loadWebhooksError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel.id, t]);

  function loadWebhooks() {
    setLoading(true);
    return channelWebhooksApi
      .list(channel.id)
      .then((items) => {
        setWebhooks(items);
        setLoadError(null);
      })
      .catch(() => setLoadError(t("loadWebhooksError")))
      .finally(() => setLoading(false));
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSecret(null);
      setCopied(null);
      setName("");
      setNameError(null);
      setRevokeTarget(null);
    }
    onOpenChange(open);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("nameRequiredError"));
      return;
    }

    setCreating(true);
    setNameError(null);
    try {
      const created = await channelWebhooksApi.create(channel.id, trimmed);
      const oneTimeSecret = buildOneTimeSecret(created.url, t);
      setSecret(oneTimeSecret);
      setWebhooks((current) => [created.webhook, ...current]);
      setName("");
      toast.success(t("webhookCreatedToast"));
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.name) {
        setNameError(error.fieldErrors.name);
      } else {
        toast.error(
          error instanceof Error ? error.message : t("createWebhookError"),
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function copyValue(
    kind: "url" | "curl",
    value: string,
    target: RefObject<HTMLTextAreaElement | null>,
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(t("copiedToast"));
    } catch {
      target.current?.focus();
      target.current?.select();
      toast.error(t("copyFailedError"));
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await channelWebhooksApi.revoke(channel.id, revokeTarget.id);
      setWebhooks((current) =>
        current.map((webhook) =>
          webhook.id === revokeTarget.id
            ? { ...webhook, revokedAt: new Date().toISOString() }
            : webhook,
        ),
      );
      setRevokeTarget(null);
      toast.success(t("webhookRevokedToast"));
    } catch {
      toast.error(t("revokeWebhookError"));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("settingsDialogTitle", { name: channel.name })}
            </DialogTitle>
            <DialogDescription>
              {t("settingsDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="overview">
            <TabsList variant="line" aria-label={t("settingsTabsLabel")}>
              <TabsTrigger value="overview">{t("overviewTab")}</TabsTrigger>
              <TabsTrigger value="webhooks">{t("webhooksTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 pt-3">
              <div>
                <p className="font-medium text-foreground-900">
                  #{channel.name}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t("channelVisibilityNote")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRename(channel)}
                >
                  <Icon name="ri-edit-line" aria-hidden data-icon="inline-start" />
                  {t("renameButton")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onDelete(channel)}
                >
                  <Icon name="ri-delete-bin-line" aria-hidden data-icon="inline-start" />
                  {t("deleteChannelAction")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="webhooks" className="space-y-5 pt-3">
              <div>
                <h3 className="font-heading font-medium text-foreground-900">
                  {t("incomingWebhooksTitle")}
                </h3>
                <p className="mt-1 text-muted-foreground">
                  {t("incomingWebhooksDescription")}
                </p>
              </div>

              {secret && (
                <Alert variant="warning">
                  <AlertDescription className="space-y-3">
                    <p className="font-medium">{t("oneTimeSecretWarning")}</p>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${nameId}-url`} className="font-medium">
                        {t("urlLabel")}
                      </Label>
                      <Textarea
                        ref={urlRef}
                        id={`${nameId}-url`}
                        value={secret.url}
                        readOnly
                        rows={2}
                        className="min-h-16 resize-none break-all font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyValue("url", secret.url, urlRef)}
                      >
                        {copied === "url" ? (
                          <Icon name="ri-check-line" aria-hidden />
                        ) : (
                          <Icon name="ri-file-copy-line" aria-hidden />
                        )}
                        {copied === "url"
                          ? t("urlCopiedButton")
                          : t("copyUrlButton")}
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${nameId}-curl`} className="font-medium">
                        {t("curlLabel")}
                      </Label>
                      <Textarea
                        ref={curlRef}
                        id={`${nameId}-curl`}
                        value={secret.curl}
                        readOnly
                        rows={4}
                        className="min-h-24 resize-none break-all font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyValue("curl", secret.curl, curlRef)}
                      >
                        {copied === "curl" ? (
                          <Icon name="ri-check-line" aria-hidden />
                        ) : (
                          <Icon name="ri-file-copy-line" aria-hidden />
                        )}
                        {copied === "curl"
                          ? t("curlCopiedButton")
                          : t("copyCurlButton")}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleCreate} className="space-y-3" noValidate>
                <Field data-invalid={!!nameError || undefined}>
                  <FieldLabel htmlFor={nameId}>
                    {t("webhookNameLabel")}
                  </FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={nameId}
                      value={name}
                      maxLength={80}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("webhookNamePlaceholder")}
                      aria-required="true"
                      aria-invalid={!!nameError || undefined}
                      aria-describedby={nameError ? nameErrorId : undefined}
                    />
                    <Button
                      type="submit"
                      disabled={creating}
                      className="shrink-0"
                    >
                      {creating ? (
                        <>
                          <Spinner aria-hidden />
                          {t("creatingButton")}
                        </>
                      ) : (
                        <>
                          <Icon name="ri-add-line" aria-hidden />
                          {t("createWebhookButton")}
                        </>
                      )}
                    </Button>
                  </div>
                  <FieldError id={nameErrorId}>{nameError}</FieldError>
                </Field>
              </form>

              {loadError && (
                <Alert variant="error">
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>{loadError}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadWebhooks()}
                    >
                      {t("retryButton")}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {loading ? (
                <div className="space-y-2" aria-label={t("loadingWebhooksLabel")}>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : webhooks.length === 0 && !loadError ? (
                <EmptyState
                  icon="ri-links-line"
                  size="sm"
                  title={t("noWebhooksTitle")}
                  description={t("noWebhooksDescription")}
                />
              ) : (
                <ul className="space-y-2" aria-label={t("webhooksListLabel")}>
                  {webhooks.map((webhook) => {
                    const revoked = webhook.revokedAt !== null;
                    return (
                      <li
                        key={webhook.id}
                        className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-foreground-900">
                              {webhook.name}
                            </span>
                            <Badge variant={revoked ? "outline" : "success"}>
                              {revoked ? t("revokedBadge") : t("activeBadge")}
                            </Badge>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {t("tokenPrefixLabel", {
                              tokenPrefix: webhook.tokenPrefix,
                            })}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("createdUsedLabel", {
                              createdAt: formatDate(webhook.createdAt, format),
                              lastUsedAt: formatDate(
                                webhook.lastUsedAt,
                                format,
                              ),
                            })}
                          </p>
                        </div>
                        {!revoked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => setRevokeTarget(webhook)}
                          >
                            {t("revokeButton")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          </Tabs>
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
              disabled={revoking}
              onClick={handleRevoke}
            >
              {revoking ? t("revokingButton") : t("revokeButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
