"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MailBody } from "./mail-body";
import { LabelChip } from "./label-chip";
import { MessageLabelPicker } from "./message-label-picker";
import { getInitials, stringToColor } from "./message-list";
import {
  ApiError,
  downloadAttachment,
  type MailAddressDto,
  type MailDetailDto,
  type MailLabelDto,
} from "./api";

type Format = ReturnType<typeof useFormatter>;
type Translate = (key: string) => string;

function formatFullDate(iso: string, format: Format): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format.dateTime(date, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAddress(address: MailAddressDto): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddressList(addresses: MailAddressDto[]): string {
  return addresses.map(formatAddress).join(", ");
}

function formatBytes(sizeBytes: number, t: Translate): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} ${t("byteUnitMb")}`;
  }
  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} ${t("byteUnitKb")}`;
  }
  return `${sizeBytes} ${t("byteUnitB")}`;
}

export interface MessagePaneProps {
  detail: MailDetailDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  hasSelection: boolean;
  /** Mobile-only: return from the detail back to the message list. */
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onEditDraft: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
  /** Account has an ARCHIVE folder and the message is not already in it. */
  canArchive: boolean;
  /** Message sits in the TRASH folder — deleting is permanent (confirm). */
  isInTrash: boolean;
  isDraft: boolean;
  labels: MailLabelDto[];
  labelsLoading: boolean;
  labelsError: string | null;
  pendingLabelIds: ReadonlySet<string>;
  labelMutationError: string | null;
  onRetryLabels: () => void;
  onToggleLabel: (label: MailLabelDto) => void;
  canCreateFilter: boolean;
  onCreateFilter: () => void;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  replyComposer?: ReactNode;
}

// Reading pane (plan §5) + Phase 6 action bar under the subject header:
// reply/forward/archive/delete/read-toggle. WEBHOOK messages only expose
// delete + read-toggle (no transport to answer through). Attachment chips
// (Phase 7) download through the lazy-cache attachment route.
export function MessagePane({
  detail,
  loading,
  error,
  onRetry,
  hasSelection,
  onBack,
  onReply,
  onForward,
  onEditDraft,
  onArchive,
  onDelete,
  onToggleRead,
  canArchive,
  isInTrash,
  isDraft,
  labels,
  labelsLoading,
  labelsError,
  pendingLabelIds,
  labelMutationError,
  onRetryLabels,
  onToggleLabel,
  canCreateFilter,
  onCreateFilter,
  filterTriggerRef,
  replyComposer,
}: MessagePaneProps) {
  const t = useTranslations("mail");
  const format = useFormatter();
  // Permanent-delete confirm (trash only) — controlled so the confirm button
  // reliably closes the dialog before the row disappears.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Attachment chip currently downloading (lazy IMAP fetch can take a
  // moment on first access) — one at a time is enough for chips.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadAttachment(
    mailId: string,
    attachmentId: string,
    filename: string,
  ) {
    if (downloadingId) return;
    setDownloadingId(attachmentId);
    try {
      await downloadAttachment(mailId, attachmentId, filename, t);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t("errorDownloadAttachment"),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  if (!hasSelection) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          bordered={false}
          size="sm"
          icon="ri-mail-open-line"
          title={t("selectMessageTitle")}
          description={t("selectMessageDescription")}
          className="max-w-xs"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <BackButton onBack={onBack} />
        <div className="space-y-3 p-6">
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button type="button" size="sm" onClick={onRetry}>
            <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
            {t("retryButton")}
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <BackButton onBack={onBack} />
        <div className="space-y-4 p-6">
          <Skeleton className="h-6 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5].map((row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = detail.fromName || detail.from;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <BackButton onBack={onBack} />
      <div className="border-b border-background-100 px-6 py-5">
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground-900">
          {detail.subject}
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {detail.labels.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5"
              aria-label={t("appliedLabelsAriaLabel")}
            >
              {detail.labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </div>
          )}
          <MessageLabelPicker
            labels={labels}
            appliedLabelIds={new Set(detail.labels.map((label) => label.id))}
            loading={labelsLoading}
            error={labelsError}
            mutationError={labelMutationError}
            pendingLabelIds={pendingLabelIds}
            onRetry={onRetryLabels}
            onToggle={onToggleLabel}
          />
        </div>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-background-50"
            style={{ backgroundColor: stringToColor(displayName) }}
          >
            {getInitials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground-900">
              {displayName}
            </p>
            <p className="truncate text-xs text-foreground-400">
              {detail.from}
            </p>
            {detail.to.length > 0 && (
              <p
                className="truncate text-xs text-foreground-400"
                title={formatAddressList(detail.to)}
              >
                {t("toAddressesLabel", {
                  addresses: formatAddressList(detail.to),
                })}
              </p>
            )}
            {detail.cc.length > 0 && (
              <p
                className="truncate text-xs text-foreground-400"
                title={formatAddressList(detail.cc)}
              >
                {t("ccAddressesLabel", {
                  addresses: formatAddressList(detail.cc),
                })}
              </p>
            )}
            <p className="mt-0.5 text-xs text-foreground-400">
              {formatFullDate(detail.receivedAt, format)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-background-100 px-4 py-1.5">
        {detail.accountKind !== "WEBHOOK" && (
          <>
            {isDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEditDraft}
              >
                <Icon
                  name="ri-edit-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("editDraftButton")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onReply}
                >
                  <Icon
                    name="ri-reply-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("replyButton")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onForward}
                >
                  <Icon
                    name="ri-share-forward-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("forwardButton")}
                </Button>
                {canArchive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onArchive}
                  >
                    <Icon
                      name="ri-archive-line"
                      aria-hidden
                      data-icon="inline-start"
                    />
                    {t("archiveButton")}
                  </Button>
                )}
              </>
            )}
          </>
        )}
        {isInTrash ? (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger
              render={<Button type="button" variant="ghost" size="sm" />}
            >
              <Icon
                name="ri-delete-bin-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("deleteButton")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteForeverTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteForeverDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false);
                    onDelete();
                  }}
                >
                  {t("deleteButton")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Icon
              name="ri-delete-bin-line"
              aria-hidden
              data-icon="inline-start"
            />
            {t("deleteButton")}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onToggleRead}>
          {detail.isRead ? (
            <>
              <Icon name="ri-mail-line" aria-hidden data-icon="inline-start" />
              {t("markUnreadButton")}
            </>
          ) : (
            <>
              <Icon
                name="ri-mail-open-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("markReadButton")}
            </>
          )}
        </Button>
        {canCreateFilter && (
          <Button
            ref={filterTriggerRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCreateFilter}
          >
            <Icon name="ri-filter-line" aria-hidden data-icon="inline-start" />
            {t("filterMessagesLikeThisButton")}
          </Button>
        )}
      </div>

      {detail.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-background-100 px-6 py-3">
          {/* Download chips (Phase 7): lazy IMAP fetch + cached bytes via
              GET /api/mail/[id]/attachments/[attId]. */}
          {detail.attachments.map((attachment) => (
            <Button
              key={attachment.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={downloadingId !== null}
              onClick={() =>
                handleDownloadAttachment(
                  detail.id,
                  attachment.id,
                  attachment.filename,
                )
              }
            >
              {downloadingId === attachment.id ? (
                <Spinner
                  aria-label={t("downloadingAttachmentAriaLabel")}
                  data-icon="inline-start"
                />
              ) : (
                <Icon
                  name="ri-attachment-line"
                  aria-hidden
                  data-icon="inline-start"
                />
              )}
              <span className="max-w-48 truncate">{attachment.filename}</span>
              <span className="text-muted-foreground">
                {formatBytes(attachment.sizeBytes, t)}
              </span>
            </Button>
          ))}
        </div>
      )}

      <div className="px-6 py-5">
        <MailBody bodyText={detail.bodyText} bodyHtml={detail.bodyHtml} />
      </div>
      {replyComposer && (
        <div className="border-t border-background-100 px-4 py-4 sm:px-6">
          {replyComposer}
        </div>
      )}
    </div>
  );
}

// Mobile-only return control — on lg+ the list stays visible next to the
// pane, so the button is hidden there.
function BackButton({ onBack }: { onBack: () => void }) {
  const t = useTranslations("mail");
  return (
    <div className="shrink-0 border-b border-background-100 px-3 py-2 lg:hidden">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <Icon
          name="ri-arrow-left-s-line"
          aria-hidden
          data-icon="inline-start"
        />
        {t("backToListButton")}
      </Button>
    </div>
  );
}
