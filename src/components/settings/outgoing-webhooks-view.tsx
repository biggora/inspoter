"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
  outgoingWebhooksApi,
  type CreatedOutgoingWebhookDto,
  type OutgoingWebhookDto,
  type OutgoingWebhookEventValue,
} from "./outgoing-webhooks-api";
import { ALL_EVENTS, EVENT_LABEL_KEY } from "./outgoing-webhooks-format";
import { OutgoingWebhookDeliveries } from "./outgoing-webhook-deliveries";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isValidHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

interface FormErrors {
  name?: string;
  url?: string;
  events?: string;
}

type FormMode =
  | { mode: "create" }
  | { mode: "edit"; webhook: OutgoingWebhookDto };

// Settings > Outgoing webhooks — subscription list + create/edit/delete and
// delivery history. Client-fetched (mirrors webhook-tokens-view): the raw
// signing secret must never round-trip through a server-rendered prop.
export function OutgoingWebhooksView() {
  const t = useTranslations("settings");
  const [webhooks, setWebhooks] = useState<OutgoingWebhookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FormMode | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<OutgoingWebhookEventValue[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [createdSecret, setCreatedSecret] =
    useState<CreatedOutgoingWebhookDto | null>(null);
  const [copied, setCopied] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<OutgoingWebhookDto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deliveriesTarget, setDeliveriesTarget] =
    useState<OutgoingWebhookDto | null>(null);

  const nameId = useId();
  const urlId = useId();
  const isActiveId = useId();

  const load = useCallback(() => {
    return outgoingWebhooksApi
      .list()
      .then((data) => {
        setWebhooks(data);
        setError(null);
      })
      .catch(() => setError(t("loadWebhooksError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset the form when the dialog target changes (adjust-state-while-rendering
  // pattern, same as service-form-dialog).
  const [prevFormState, setPrevFormState] = useState(formState);
  if (formState !== prevFormState) {
    setPrevFormState(formState);
    if (formState?.mode === "edit") {
      const webhook = formState.webhook;
      setName(webhook.name);
      setUrl(webhook.url);
      setEvents(webhook.events);
      setIsActive(webhook.isActive);
    } else if (formState?.mode === "create") {
      setName("");
      setUrl("");
      setEvents([]);
      setIsActive(true);
    }
    setErrors({});
    setCreatedSecret(null);
    setCopied(false);
  }

  function toggleEvent(event: OutgoingWebhookEventValue, checked: boolean) {
    setEvents((current) =>
      checked
        ? [...current, event]
        : current.filter((value) => value !== event),
    );
  }

  function handleFormOpenChange(open: boolean) {
    if (!open) {
      setFormState(null);
      // Refresh once after a create/edit closes so the list reflects changes.
      load();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    const nextErrors: FormErrors = {};
    if (!trimmedName) nextErrors.name = t("nameRequiredError");
    if (!trimmedUrl) nextErrors.url = t("urlRequiredError");
    else if (!isValidHttpsUrl(trimmedUrl)) nextErrors.url = t("urlInvalidError");
    if (events.length === 0) nextErrors.events = t("eventsRequiredError");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (formState?.mode === "edit") {
        await outgoingWebhooksApi.update(formState.webhook.id, {
          name: trimmedName,
          url: trimmedUrl,
          events,
          isActive,
        });
        toast.success(t("webhookUpdatedToast"));
        setFormState(null);
        load();
      } else {
        const created = await outgoingWebhooksApi.create({
          name: trimmedName,
          url: trimmedUrl,
          events,
          isActive,
        });
        setCreatedSecret(created);
        toast.success(t("webhookCreatedToast"));
      }
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors(err.fieldErrors);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveWebhookError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret.secret);
      setCopied(true);
      toast.success(t("copiedToClipboardToast"));
    } catch {
      toast.error(t("copyFailedError"));
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await outgoingWebhooksApi.remove(deleteTarget.id);
      toast.success(t("webhookDeletedToast"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteWebhookError"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleTest(webhook: OutgoingWebhookDto) {
    try {
      await outgoingWebhooksApi.test(webhook.id);
      toast.success(t("webhookTestSentToast"));
    } catch {
      toast.error(t("testWebhookError"));
    }
  }

  const isEdit = formState?.mode === "edit";

  return (
    <PageBody>
      <PageHeader
        title={t("outgoingWebhooksTitle")}
        back={{ href: "/settings", label: t("backToSettings") }}
        actions={
          <Button size="sm" onClick={() => setFormState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("newWebhookButton")}
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
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon="ri-send-plane-line"
          title={t("emptyWebhooksTitle")}
          description={t("emptyWebhooksDescription")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("urlHeader")}</TableHead>
              <TableHead>{t("eventsHeader")}</TableHead>
              <TableHead>{t("statusHeader")}</TableHead>
              <TableHead>{t("createdHeader")}</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((webhook) => (
              <TableRow key={webhook.id}>
                <TableCell className="font-medium text-foreground">
                  {webhook.name}
                </TableCell>
                <TableCell className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground">
                  {webhook.url}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <Badge key={event} className="bg-muted text-muted-foreground">
                        {t(EVENT_LABEL_KEY[event])}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      webhook.isActive
                        ? "bg-(--success-bg) text-(--success-text)"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {webhook.isActive
                      ? t("webhookActive")
                      : t("webhookInactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(webhook.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(webhook)}
                    >
                      {t("testButton")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeliveriesTarget(webhook)}
                    >
                      {t("deliveriesButton")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFormState({ mode: "edit", webhook })}
                    >
                      {t("editButton")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(webhook)}
                    >
                      {t("deleteButton")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={formState !== null} onOpenChange={handleFormOpenChange}>
        <DialogContent>
          {!createdSecret ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isEdit ? t("editWebhookTitle") : t("newWebhookTitle")}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-4"
              >
                <FieldGroup>
                  <Field data-invalid={!!errors.name || undefined}>
                    <FieldLabel htmlFor={nameId}>{t("nameLabel")}</FieldLabel>
                    <Input
                      id={nameId}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("webhookNamePlaceholder")}
                      aria-required="true"
                      aria-invalid={!!errors.name || undefined}
                      aria-describedby={
                        errors.name ? `${nameId}-error` : undefined
                      }
                      autoFocus
                    />
                    <FieldError id={`${nameId}-error`}>{errors.name}</FieldError>
                  </Field>

                  <Field data-invalid={!!errors.url || undefined}>
                    <FieldLabel htmlFor={urlId}>{t("urlLabel")}</FieldLabel>
                    <Input
                      id={urlId}
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://example.com/webhooks/inspot"
                      aria-required="true"
                      aria-invalid={!!errors.url || undefined}
                      aria-describedby={
                        errors.url ? `${urlId}-error` : undefined
                      }
                    />
                    <FieldError id={`${urlId}-error`}>{errors.url}</FieldError>
                  </Field>

                  <Field data-invalid={!!errors.events || undefined}>
                    <FieldLabel>{t("eventsLabel")}</FieldLabel>
                    <div className="flex flex-col gap-2">
                      {ALL_EVENTS.map((event) => {
                        const checkboxId = `${urlId}-event-${event}`;
                        return (
                          <div
                            key={event}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={events.includes(event)}
                              onCheckedChange={(value) =>
                                toggleEvent(event, value === true)
                              }
                            />
                            <FieldLabel
                              htmlFor={checkboxId}
                              className="cursor-pointer font-normal"
                            >
                              {t(EVENT_LABEL_KEY[event])}
                            </FieldLabel>
                          </div>
                        );
                      })}
                    </div>
                    <FieldError>{errors.events}</FieldError>
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id={isActiveId}
                      checked={isActive}
                      onCheckedChange={(value) => setIsActive(value === true)}
                    />
                    <FieldLabel
                      htmlFor={isActiveId}
                      className="cursor-pointer font-normal"
                    >
                      {t("isActiveLabel")}
                    </FieldLabel>
                  </Field>
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
                        {isEdit ? t("savingLabel") : t("creatingLabel")}
                      </>
                    ) : isEdit ? (
                      t("saveButton")
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
                <DialogTitle>{t("webhookSecretCreatedTitle")}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-(--warning-text)">
                  {t("copyWebhookSecretWarning")}
                </p>
                <div className="rounded-md border border-border bg-(--bg-sunken) p-3">
                  <code className="block break-all font-mono text-sm text-foreground">
                    {createdSecret.secret}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={handleCopy}
                >
                  <Icon
                    name={copied ? "ri-check-line" : "ri-file-copy-line"}
                    aria-hidden
                    className="text-base"
                  />
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteWebhookConfirmTitle", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteWebhookConfirmDescription")}
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

      <OutgoingWebhookDeliveries
        webhook={deliveriesTarget}
        onOpenChange={(open) => !open && setDeliveriesTarget(null)}
      />
    </PageBody>
  );
}
