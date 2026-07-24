"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  ApiError,
  deleteMailDraftAttachment,
  saveMailDraft,
  sendMail,
  uploadMailDraftAttachment,
  type MailDetailDto,
  type MailDraftAttachmentDto,
  type MailDraftDto,
} from "./api";
import { RichTextEditor, type RichTextValue } from "./rich-text-editor";

export type ComposeMode = "new" | "reply" | "forward";

interface ComposeBaseProps {
  original: MailDetailDto | null;
  accountId: string;
  initialDraft?: MailDraftDto | null;
  onSent: () => void;
  onDraftSaved?: (draft: MailDraftDto) => void;
}

interface ComposeDialogProps extends ComposeBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposeMode;
}

interface InlineReplyComposerProps extends Omit<ComposeBaseProps, "original"> {
  original: MailDetailDto;
  onCancel: () => void;
}

interface ComposeFormProps extends ComposeBaseProps {
  mode: ComposeMode;
  variant: "dialog" | "inline";
  onCancel: () => void;
}

interface ComposeFormHandle {
  saveBeforeClose: () => Promise<boolean>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CLIENT_ATTACHMENT_BYTES = 26_214_400;
const MAX_CLIENT_ATTACHMENTS = 10;
const EMPTY_BODY: RichTextValue = {
  html: "<p></p>",
  text: "",
  isEmpty: true,
};

function withPrefix(prefix: "Re" | "Fwd", subject: string): string {
  return new RegExp(`^${prefix}:`, "i").test(subject.trim())
    ? subject
    : `${prefix}: ${subject}`;
}

function parseAddressList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("mail");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("discardDraftTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("discardDraftDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keepEditingButton")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {t("discardDraftButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OriginalPreview({ original }: { original: MailDetailDto }) {
  const t = useTranslations("mail");
  return (
    <details className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-foreground-500 outline-none focus-visible:text-foreground-900">
        {t("originalMessagePreview")}
      </summary>
      <div className="mt-3 border-t border-[var(--border-default)] pt-3">
        <p className="mb-2 text-xs text-foreground-400">
          {original.fromName || original.from} · {original.subject}
        </p>
        <pre className="font-sans text-xs leading-5 whitespace-pre-wrap break-words text-foreground-600">
          {original.bodyText}
        </pre>
      </div>
    </details>
  );
}

const ComposeForm = forwardRef<ComposeFormHandle, ComposeFormProps>(
  function ComposeForm(
    {
      mode,
      variant,
      original,
      accountId,
      initialDraft = null,
      onSent,
      onDraftSaved,
      onCancel,
    },
    ref,
  ) {
    const t = useTranslations("mail");
    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const draftIdRef = useRef(initialDraft?.id);
    const savePromiseRef = useRef<Promise<MailDraftDto> | null>(null);
    const changeVersionRef = useRef(0);

    const [to, setTo] = useState(
      initialDraft?.to.join(", ") ??
        (mode === "reply" && original ? original.from : ""),
    );
    const [cc, setCc] = useState(initialDraft?.cc.join(", ") ?? "");
    const [bcc, setBcc] = useState(initialDraft?.bcc.join(", ") ?? "");
    const [showCcBcc, setShowCcBcc] = useState(
      Boolean(initialDraft?.cc.length || initialDraft?.bcc.length),
    );
    const [subject, setSubject] = useState(() => {
      if (initialDraft) return initialDraft.subject;
      if (!original) return "";
      return mode === "reply"
        ? withPrefix("Re", original.subject)
        : withPrefix("Fwd", original.subject);
    });
    const [body, setBody] = useState<RichTextValue>(() =>
      initialDraft
        ? {
            html: initialDraft.bodyHtml,
            text: initialDraft.bodyText,
            isEmpty: !initialDraft.bodyText.trim(),
          }
        : EMPTY_BODY,
    );
    const [attachments, setAttachments] = useState<MailDraftAttachmentDto[]>(
      initialDraft?.attachments ?? [],
    );
    const [dirty, setDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>(
      initialDraft ? "saved" : "idle",
    );
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
      initialDraft ? new Date(initialDraft.updatedAt) : null,
    );
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const baseId = useId();
    const fieldId = (field: string) => `${baseId}-${field}`;
    const inReplyToId =
      initialDraft?.inReplyToId ??
      (mode === "reply" && original ? original.id : undefined);
    const forwardOfId =
      initialDraft?.forwardOfId ??
      (mode === "forward" && original ? original.id : undefined);

    function markDirty() {
      changeVersionRef.current += 1;
      setDirty(true);
      setSaveStatus("idle");
    }

    function updateValue(setValue: (value: string) => void, value: string) {
      setValue(value);
      markDirty();
    }

    const persistDraft = useCallback(async (): Promise<MailDraftDto> => {
      if (savePromiseRef.current) {
        await savePromiseRef.current.catch(() => undefined);
      }
      const savedVersion = changeVersionRef.current;
      setSaveStatus("saving");
      const promise = saveMailDraft({
        ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}),
        accountId,
        to: parseAddressList(to),
        cc: parseAddressList(cc),
        bcc: parseAddressList(bcc),
        subject,
        bodyText: body.text,
        bodyHtml: body.html,
        ...(inReplyToId ? { inReplyToId } : {}),
        ...(forwardOfId ? { forwardOfId } : {}),
      });
      savePromiseRef.current = promise;
      try {
        const saved = await promise;
        draftIdRef.current = saved.id;
        if (changeVersionRef.current === savedVersion) setDirty(false);
        setSaveStatus("saved");
        setLastSavedAt(new Date(saved.updatedAt));
        onDraftSaved?.(saved);
        return saved;
      } catch (error) {
        setSaveStatus("error");
        throw error;
      } finally {
        if (savePromiseRef.current === promise) savePromiseRef.current = null;
      }
    }, [
      accountId,
      bcc,
      body.html,
      body.text,
      cc,
      forwardOfId,
      inReplyToId,
      onDraftSaved,
      subject,
      to,
    ]);

    useEffect(() => {
      if (!dirty || submitting || uploading) return;
      const timer = setTimeout(() => {
        void persistDraft().catch(() => undefined);
      }, 900);
      return () => clearTimeout(timer);
    }, [dirty, persistDraft, submitting, uploading]);

    useImperativeHandle(
      ref,
      () => ({
        async saveBeforeClose() {
          if (!dirty && saveStatus !== "error") return true;
          try {
            await persistDraft();
            return true;
          } catch {
            return false;
          }
        },
      }),
      [dirty, persistDraft, saveStatus],
    );

    function validateAddressField(
      field: string,
      addresses: string[],
      nextErrors: Record<string, string>,
    ) {
      const invalid = addresses.find((address) => !EMAIL_REGEX.test(address));
      if (invalid) {
        nextErrors[field] = t("invalidAddressError", { address: invalid });
      }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (submitting || uploading) return;

      const toList = parseAddressList(to);
      const ccList = parseAddressList(cc);
      const bccList = parseAddressList(bcc);
      const nextErrors: Record<string, string> = {};

      if (toList.length === 0) nextErrors.to = t("toRequiredError");
      validateAddressField("to", toList, nextErrors);
      validateAddressField("cc", ccList, nextErrors);
      validateAddressField("bcc", bccList, nextErrors);
      if (!subject.trim()) nextErrors.subject = t("subjectRequiredError");
      if (body.isEmpty || !body.text.trim()) {
        nextErrors.bodyText = t("bodyRequiredError");
      }
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }

      setSubmitting(true);
      setErrors({});
      try {
        await sendMail({
          accountId,
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          bodyText: body.text,
          bodyHtml: body.html,
          ...(inReplyToId ? { inReplyToId } : {}),
          ...(forwardOfId ? { forwardOfId } : {}),
          ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}),
        });
        setDirty(false);
        toast.success(t("sendSuccessToast"));
        onSent();
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.fieldErrors &&
          Object.keys(error.fieldErrors).length > 0
        ) {
          setErrors(error.fieldErrors);
        } else {
          toast.error(
            error instanceof ApiError ? error.message : t("errorSendMail"),
          );
        }
      } finally {
        setSubmitting(false);
      }
    }

    async function handleFiles(files: FileList | null) {
      if (!files || files.length === 0 || uploading) return;
      const selected = Array.from(files);
      if (attachments.length + selected.length > MAX_CLIENT_ATTACHMENTS) {
        toast.error(t("errorDraftAttachmentLimit"));
        return;
      }
      if (selected.some((file) => file.size > MAX_CLIENT_ATTACHMENT_BYTES)) {
        toast.error(t("errorDraftAttachmentTooLarge"));
        return;
      }

      setUploading(true);
      try {
        const draft = await persistDraft();
        const uploaded: MailDraftAttachmentDto[] = [];
        for (const file of selected) {
          uploaded.push(await uploadMailDraftAttachment(draft.id, file));
        }
        setAttachments((current) => [...current, ...uploaded]);
        onDraftSaved?.({
          ...draft,
          attachments: [...draft.attachments, ...uploaded],
        });
        toast.success(t("attachmentsAddedToast", { count: uploaded.length }));
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : t("errorUploadAttachment"),
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }

    async function removeAttachment(attachmentId: string) {
      const draftId = draftIdRef.current;
      if (!draftId) return;
      try {
        await deleteMailDraftAttachment(draftId, attachmentId);
        setAttachments((current) =>
          current.filter((attachment) => attachment.id !== attachmentId),
        );
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : t("errorRemoveAttachment"),
        );
      }
    }

    function renderAddressField(
      field: string,
      label: string,
      value: string,
      setValue: (value: string) => void,
      autoFocus = false,
    ) {
      const message = errors[field];
      const id = fieldId(field);
      return (
        <Field data-invalid={!!message || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            id={id}
            value={value}
            onChange={(event) => updateValue(setValue, event.target.value)}
            placeholder={t("addressPlaceholder")}
            autoComplete="off"
            autoFocus={autoFocus}
            aria-invalid={!!message || undefined}
            aria-describedby={message ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`}>{message}</FieldError>
        </Field>
      );
    }

    const bodyError = errors.bodyText ?? errors.bodyHtml;

    return (
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className={cn(
          "flex min-h-0 flex-col",
          variant === "dialog" ? "flex-1" : "gap-3",
        )}
      >
        <div
          className={cn(
            "space-y-3",
            variant === "dialog" && "px-5 py-4",
          )}
        >
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {renderAddressField(
                "to",
                t("toLabel"),
                to,
                setTo,
                mode !== "reply" && !initialDraft,
              )}
            </div>
            {!showCcBcc && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCcBcc(true)}
              >
                {t("ccBccButton")}
              </Button>
            )}
          </div>

          {showCcBcc && (
            <div className="grid gap-3 sm:grid-cols-2">
              {renderAddressField("cc", t("ccLabel"), cc, setCc)}
              {renderAddressField("bcc", t("bccLabel"), bcc, setBcc)}
            </div>
          )}

          <Field data-invalid={!!errors.subject || undefined}>
            <FieldLabel htmlFor={fieldId("subject")}>
              {t("subjectLabel")}
            </FieldLabel>
            <Input
              id={fieldId("subject")}
              value={subject}
              onChange={(event) => updateValue(setSubject, event.target.value)}
              autoComplete="off"
              aria-invalid={!!errors.subject || undefined}
              aria-describedby={
                errors.subject ? `${fieldId("subject")}-error` : undefined
              }
            />
            <FieldError id={`${fieldId("subject")}-error`}>
              {errors.subject}
            </FieldError>
          </Field>

          <Field data-invalid={!!bodyError || undefined}>
            <FieldLabel id={`${fieldId("body")}-label`}>
              {t("bodyLabel")}
            </FieldLabel>
            <RichTextEditor
              id={fieldId("body")}
              labelledBy={`${fieldId("body")}-label`}
              initialHtml={initialDraft?.bodyHtml}
              autoFocus={mode === "reply" && !initialDraft}
              compact={variant === "inline"}
              invalid={!!bodyError}
              describedBy={bodyError ? `${fieldId("body")}-error` : undefined}
              onChange={(value) => {
                setBody(value);
                markDirty();
              }}
              onSubmitShortcut={() => formRef.current?.requestSubmit()}
              labels={{
                toolbar: t("formatToolbarLabel"),
                bold: t("formatBold"),
                italic: t("formatItalic"),
                underline: t("formatUnderline"),
                bulletList: t("formatBulletList"),
                orderedList: t("formatOrderedList"),
                blockquote: t("formatBlockquote"),
                link: t("formatLink"),
                linkUrl: t("linkUrlLabel"),
                applyLink: t("applyLinkButton"),
                removeLink: t("removeLinkButton"),
                clearFormatting: t("clearFormattingButton"),
                undo: t("undoButton"),
                redo: t("redoButton"),
              }}
            />
            <FieldError id={`${fieldId("body")}-error`}>{bodyError}</FieldError>
          </Field>

          <div className="space-y-2">
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                uploading || attachments.length >= MAX_CLIENT_ATTACHMENTS
              }
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <Icon
                  name="ri-attachment-2"
                  aria-hidden
                  data-icon="inline-start"
                />
              )}
              {uploading ? t("uploadingAttachments") : t("attachFilesButton")}
            </Button>
            {attachments.length > 0 && (
              <ul
                aria-label={t("draftAttachmentsLabel")}
                className="flex flex-wrap gap-2"
              >
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-xs"
                  >
                    <Icon name="ri-attachment-line" aria-hidden />
                    <span className="max-w-48 truncate">
                      {attachment.filename}
                    </span>
                    <span className="text-muted-foreground">
                      {formatBytes(attachment.sizeBytes)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("removeDraftAttachment", {
                        filename: attachment.filename,
                      })}
                      onClick={() => void removeAttachment(attachment.id)}
                    >
                      <Icon name="ri-close-line" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {mode === "forward" && original && (
            <OriginalPreview original={original} />
          )}
        </div>

        <div
          className={cn(
            "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between",
            variant === "dialog" ? "border-t bg-muted/50 px-5 py-3" : "pt-1",
          )}
        >
          <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
            {saveStatus === "saving" && (
              <>
                <Spinner aria-hidden className="size-3" />
                {t("savingDraftLabel")}
              </>
            )}
            {saveStatus === "saved" && lastSavedAt && (
              <>
                <Icon name="ri-check-line" aria-hidden />
                {t("draftSavedLabel")}
              </>
            )}
            {saveStatus === "error" && (
              <span className="text-destructive">
                {t("draftSaveFailedLabel")}
              </span>
            )}
            {saveStatus === "idle" && t("sendShortcutHint")}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("closeButton")}
            </Button>
            <Button type="submit" disabled={submitting || uploading}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("sendingLabel")}
                </>
              ) : (
                <>
                  <Icon
                    name={
                      mode === "reply"
                        ? "ri-reply-line"
                        : "ri-send-plane-2-line"
                    }
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {mode === "reply" ? t("replySendButton") : t("sendButton")}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    );
  },
);

export function ComposeDialog({
  open,
  onOpenChange,
  mode,
  original,
  accountId,
  initialDraft = null,
  onSent,
  onDraftSaved,
}: ComposeDialogProps) {
  const t = useTranslations("mail");
  const formRef = useRef<ComposeFormHandle>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  async function requestClose() {
    const saved = (await formRef.current?.saveBeforeClose()) ?? true;
    if (saved) onOpenChange(false);
    else setDiscardOpen(true);
  }

  const title = initialDraft
    ? t("editDraftTitle")
    : mode === "forward"
      ? t("forwardDialogTitle")
      : t("newDialogTitle");

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) void requestClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-none gap-0 rounded-none p-0 sm:max-w-4xl sm:rounded-xl"
        >
          <DialogHeader className="flex-row items-center justify-between border-b px-5 py-4">
            <DialogTitle>{title}</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("closeComposerButton")}
              onClick={() => void requestClose()}
            >
              <Icon name="ri-close-line" aria-hidden />
            </Button>
          </DialogHeader>
          <ComposeForm
            ref={formRef}
            mode={mode}
            variant="dialog"
            original={original}
            accountId={accountId}
            initialDraft={initialDraft}
            onCancel={() => void requestClose()}
            onDraftSaved={onDraftSaved}
            onSent={() => {
              onOpenChange(false);
              onSent();
            }}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export function InlineReplyComposer({
  original,
  accountId,
  initialDraft = null,
  onSent,
  onDraftSaved,
  onCancel,
}: InlineReplyComposerProps) {
  const t = useTranslations("mail");
  const formRef = useRef<ComposeFormHandle>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  async function requestClose() {
    const saved = (await formRef.current?.saveBeforeClose()) ?? true;
    if (saved) onCancel();
    else setDiscardOpen(true);
  }

  return (
    <>
      <section
        aria-labelledby={`reply-${original.id}-title`}
        className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3
            id={`reply-${original.id}-title`}
            className="font-heading text-sm font-semibold text-foreground-900"
          >
            {t("replyDialogTitle")}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("closeComposerButton")}
            onClick={() => void requestClose()}
          >
            <Icon name="ri-close-line" aria-hidden />
          </Button>
        </div>
        <ComposeForm
          ref={formRef}
          mode="reply"
          variant="inline"
          original={original}
          accountId={accountId}
          initialDraft={initialDraft}
          onCancel={() => void requestClose()}
          onDraftSaved={onDraftSaved}
          onSent={onSent}
        />
      </section>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onCancel();
        }}
      />
    </>
  );
}
