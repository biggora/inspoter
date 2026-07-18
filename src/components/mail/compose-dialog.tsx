"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, sendMail, type MailDetailDto } from "./api";

export type ComposeMode = "new" | "reply" | "forward";

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposeMode;
  /** Source message for reply/forward prefill; null for a new message. */
  original: MailDetailDto | null;
  /** IMAP account the message is sent from. */
  accountId: string;
  onSent: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withPrefix(prefix: "Re" | "Fwd", subject: string): string {
  return new RegExp(`^${prefix}:`, "i").test(subject.trim())
    ? subject
    : `${prefix}: ${subject}`;
}

function quoteOriginal(original: MailDetailDto): string {
  return `\n\n---- Исходное письмо ----\n${original.bodyText}`;
}

// Comma-separated address input → trimmed list (empty entries dropped).
function parseAddressList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Compose/reply/forward dialog (plan §5 Phase 6, patterned after
// mail-account-dialog). Rendered only while open (mail-client-view guards),
// so prefill lives in useState initializers — no re-sync effects needed.
export function ComposeDialog({
  open,
  onOpenChange,
  mode,
  original,
  accountId,
  onSent,
}: ComposeDialogProps) {
  const [to, setTo] = useState(
    mode === "reply" && original ? original.from : "",
  );
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(() => {
    if (!original) return "";
    if (mode === "reply") return withPrefix("Re", original.subject);
    if (mode === "forward") return withPrefix("Fwd", original.subject);
    return "";
  });
  const [body, setBody] = useState(() =>
    original && mode !== "new" ? quoteOriginal(original) : "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const baseId = useId();
  const fieldId = (field: string) => `${baseId}-${field}`;

  function validateAddressField(
    field: string,
    addresses: string[],
    nextErrors: Record<string, string>,
  ) {
    const invalid = addresses.find((address) => !EMAIL_REGEX.test(address));
    if (invalid) {
      nextErrors[field] = `Некорректный адрес: ${invalid}`;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const toList = parseAddressList(to);
    const ccList = parseAddressList(cc);
    const bccList = parseAddressList(bcc);

    const nextErrors: Record<string, string> = {};
    if (toList.length === 0) {
      nextErrors.to = "Укажите хотя бы одного получателя.";
    }
    validateAddressField("to", toList, nextErrors);
    validateAddressField("cc", ccList, nextErrors);
    validateAddressField("bcc", bccList, nextErrors);
    if (!subject.trim()) nextErrors.subject = "Тема обязательна.";
    if (!body.trim()) nextErrors.body = "Текст письма обязателен.";
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
        body,
        ...(mode === "reply" && original
          ? { inReplyToId: original.id }
          : {}),
      });
      toast.success("Письмо отправлено");
      onOpenChange(false);
      onSent();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors(err.fieldErrors);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось отправить письмо. Попробуйте снова.",
        );
      }
    } finally {
      setSubmitting(false);
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
          onChange={(event) => setValue(event.target.value)}
          placeholder="адрес@example.ru, адрес2@example.ru"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={!!message || undefined}
          aria-describedby={message ? `${id}-error` : undefined}
        />
        <FieldError id={`${id}-error`}>{message}</FieldError>
      </Field>
    );
  }

  const title =
    mode === "reply"
      ? "Ответить"
      : mode === "forward"
        ? "Переслать письмо"
        : "Новое письмо";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {renderAddressField("to", "Кому", to, setTo, mode !== "reply")}
              </div>
              {!showCcBcc && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCcBcc(true)}
                >
                  Копия/СК
                </Button>
              )}
            </div>

            {showCcBcc && (
              <>
                {renderAddressField("cc", "Копия", cc, setCc)}
                {renderAddressField("bcc", "Скрытая копия", bcc, setBcc)}
              </>
            )}

            <Field data-invalid={!!errors.subject || undefined}>
              <FieldLabel htmlFor={fieldId("subject")}>Тема</FieldLabel>
              <Input
                id={fieldId("subject")}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
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

            <Field data-invalid={!!errors.body || undefined}>
              <FieldLabel htmlFor={fieldId("body")}>Текст письма</FieldLabel>
              <Textarea
                id={fieldId("body")}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={10}
                autoFocus={mode === "reply"}
                aria-invalid={!!errors.body || undefined}
                aria-describedby={
                  errors.body ? `${fieldId("body")}-error` : undefined
                }
              />
              <FieldError id={`${fieldId("body")}-error`}>
                {errors.body}
              </FieldError>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  Отправка…
                </>
              ) : (
                "Отправить"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
