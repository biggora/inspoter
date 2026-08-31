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
import { RefreshButton } from "@/components/ui/refresh-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { LoadingRegion } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AddToContactsButton } from "@/components/contacts/add-to-contacts-button";
import { getInitials, avatarStyle } from "@/lib/mail/avatar";
import { formatByteSize } from "@/lib/format/bytes";
import { MailBody } from "./mail-body";
import { LabelChip } from "./label-chip";
import { MessageLabelPicker } from "./message-label-picker";
import {
  ApiError,
  downloadAttachment,
  type MailAddressDto,
  type MailDetailDto,
  type MailLabelDto,
} from "./api";

type Format = ReturnType<typeof useFormatter>;

// The AI summary is a per-message piece of view state, so it is modeled as a
// union rather than three loose booleans: "loading with a stale summary still
// on screen" is not a state this pane should be able to represent.
export type MailAiSummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      summary: string;
      bullets: string[];
      actionItems: string[];
      truncated: boolean;
    }
  | { status: "error"; messageKey: string };

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
  /**
   * False once a request has come back 501 AI_UNAVAILABLE, which hides the AI
   * controls for the rest of the session. There is no probe request on render:
   * whether a model is configured only matters after a click.
   */
  aiEnabled: boolean;
  summary: MailAiSummaryState;
  onSummarize: () => void;
  onDismissSummary: () => void;
  proposingFilter: boolean;
  onProposeFilter: () => void;
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
  aiEnabled,
  summary,
  onSummarize,
  onDismissSummary,
  proposingFilter,
  onProposeFilter,
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
          <RefreshButton
            type="button"
            size="sm"
            onClick={onRetry}
            label={t("retryButton")}
            variant="default"
          />
        </div>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <BackButton onBack={onBack} />
        <LoadingRegion className="space-y-4 p-6">
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
        </LoadingRegion>
      </div>
    );
  }

  const displayName = detail.fromName || detail.from;

  return (
    // Slot marker: the pane's actions ("Archive", "Delete") share their
    // wording with the sidebar's folder buttons, so a test asserting on one of
    // them needs a container to scope to.
    <div
      data-slot="message-pane"
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
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
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={avatarStyle(displayName)}
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
                {/* Renders nothing when the From header holds no usable
                    address, which is the case for some webhook-ingested mail. */}
                <AddToContactsButton
                  address={detail.from}
                  displayName={detail.fromName ?? undefined}
                />
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
        {aiEnabled && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={summary.status === "loading"}
              onClick={onSummarize}
            >
              {summary.status === "loading" ? (
                <Spinner
                  aria-label={t("aiSummaryLoadingLabel")}
                  data-icon="inline-start"
                />
              ) : (
                <Icon
                  name="ri-sparkling-2-line"
                  aria-hidden
                  data-icon="inline-start"
                />
              )}
              {t("aiSummarizeButton")}
            </Button>
            {canCreateFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={proposingFilter}
                onClick={onProposeFilter}
              >
                {proposingFilter ? (
                  <Spinner
                    aria-label={t("aiProposeFilterLoadingLabel")}
                    data-icon="inline-start"
                  />
                ) : (
                  <Icon
                    name="ri-magic-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                )}
                {t("aiProposeFilterButton")}
              </Button>
            )}
          </>
        )}
      </div>

      {summary.status !== "idle" && (
        <div
          data-slot="message-ai-summary"
          className="border-b border-background-100 px-6 py-4"
        >
          <AiSummary summary={summary} onDismiss={onDismissSummary} />
        </div>
      )}

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
                {formatByteSize(attachment.sizeBytes, t)}
              </span>
            </Button>
          ))}
        </div>
      )}

      <div className="px-6 py-5">
        {detail.bodyTruncated ? (
          <Alert className="mb-4">
            <AlertDescription>{t("messageBodyTruncated")}</AlertDescription>
          </Alert>
        ) : null}
        <MailBody
          key={detail.id}
          bodyText={detail.bodyText}
          bodyHtml={detail.bodyHtml}
        />
      </div>
      {replyComposer && (
        <div className="border-t border-background-100 px-4 py-4 sm:px-6">
          {replyComposer}
        </div>
      )}
    </div>
  );
}

// The summary panel. Presentational like the rest of this file: it renders a
// MailAiSummaryState and never fetches. The disclaimer is not decoration —
// specs/ai-integration.md requires the model's output to be visibly a
// proposal the operator checks, never a fact the product asserts.
function AiSummary({
  summary,
  onDismiss,
}: {
  summary: MailAiSummaryState;
  onDismiss: () => void;
}) {
  const t = useTranslations("mail");

  if (summary.status === "loading") {
    return (
      <LoadingRegion>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </LoadingRegion>
    );
  }

  if (summary.status === "error") {
    return (
      <Alert variant="error">
        <AlertDescription>{t(summary.messageKey)}</AlertDescription>
      </Alert>
    );
  }

  if (summary.status !== "ready") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {t("aiSummaryTitle")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("aiSummaryDismissButton")}
          onClick={onDismiss}
        >
          <Icon name="ri-close-line" aria-hidden className="text-base" />
        </Button>
      </div>

      <p className="text-sm text-foreground">{summary.summary}</p>

      {summary.bullets.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {summary.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}

      {summary.actionItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-foreground">
            {t("aiSummaryActionItemsTitle")}
          </h4>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {summary.actionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.truncated && (
        <p className="text-xs text-muted-foreground">
          {t("aiSummaryTruncatedNotice")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t("aiSummaryDisclaimer")}
      </p>
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
