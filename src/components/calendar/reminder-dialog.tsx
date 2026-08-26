"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  CalendarLinkInput,
  CalendarReminderOccurrenceDto,
  RecurrenceRuleInput,
} from "@/lib/calendar/types";
import {
  defaultLocalInput,
  instantToLocalInput,
  localInputToInstant,
} from "@/lib/calendar/client-time";
import { calendarApi } from "./api";
import { LinkPicker } from "./link-picker";
import { RecurrenceFields } from "./recurrence-fields";

export function ReminderDialog({
  open,
  reminder,
  initialDueAt,
  timeZone,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  reminder: CalendarReminderOccurrenceDto | null;
  initialDueAt?: string | null;
  timeZone: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("calendar");
  const identity = reminder?.id ?? `${initialDueAt ?? "new"}:${open}`;
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(defaultLocalInput(timeZone, 60));
  const [payment, setPayment] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceRuleInput | null>(
    null,
  );
  const [links, setLinks] = useState<CalendarLinkInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (identity !== previousIdentity) {
    setPreviousIdentity(identity);
    setTitle(reminder?.title ?? "");
    setDescription(reminder?.description ?? "");
    setDueAt(
      instantToLocalInput(
        reminder?.scheduledFor ??
          initialDueAt ??
          new Date(new Date().getTime() + 3_600_000).toISOString(),
        timeZone,
      ),
    );
    setPayment(reminder?.kind === "PAYMENT");
    setAmount(reminder?.amount ?? "");
    setCurrency(reminder?.currency ?? "EUR");
    setPayee(reminder?.payee ?? "");
    setReference(reminder?.paymentReference ?? "");
    setPaymentUrl(reminder?.paymentUrl ?? "");
    setRecurrence(reminder?.recurrence ?? null);
    setLinks(reminder?.links ?? []);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const input = {
      kind: payment ? ("PAYMENT" as const) : ("STANDARD" as const),
      title: title.trim(),
      description: description.trim() || null,
      dueAt: localInputToInstant(dueAt, timeZone),
      timeZone,
      recurrence,
      amount: payment ? amount : null,
      currency: payment ? currency.toUpperCase() : null,
      payee: payment ? payee : null,
      paymentReference: payment ? reference || null : null,
      paymentUrl: payment ? paymentUrl || null : null,
      links,
    };
    try {
      if (reminder)
        await calendarApi.updateReminder(reminder.reminderId, input);
      else await calendarApi.createReminder(input);
      toast.success(t("saved"));
      onSaved();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!reminder) return;
    setSubmitting(true);
    try {
      await calendarApi.removeReminder(reminder.reminderId);
      toast.success(t("deleted"));
      onSaved();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {reminder ? t("editReminderTitle") : t("newReminder")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field>
            <FieldLabel>{t("titleLabel")}</FieldLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel>{t("dueLabel")}</FieldLabel>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel>{t("descriptionLabel")}</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              checked={payment}
              onCheckedChange={(checked) => setPayment(checked === true)}
            />
            <FieldLabel>{t("paymentLabel")}</FieldLabel>
          </Field>
          {payment && (
            <div className="grid gap-4 rounded-lg border bg-muted/25 p-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("amountLabel")}</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("currencyLabel")}</FieldLabel>
                <Input
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("payeeLabel")}</FieldLabel>
                <Input
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("referenceLabel")}</FieldLabel>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>{t("paymentUrlLabel")}</FieldLabel>
                <Input
                  type="url"
                  value={paymentUrl}
                  onChange={(e) => setPaymentUrl(e.target.value)}
                />
              </Field>
            </div>
          )}
          <RecurrenceFields value={recurrence} onChange={setRecurrence} />
          <Field>
            <FieldLabel>{t("linksLabel")}</FieldLabel>
            <LinkPicker value={links} onChange={setLinks} />
          </Field>
          <DialogFooter>
            {reminder && (
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={submitting}
              >
                {t("delete")}
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="submit"
              disabled={
                submitting ||
                !title.trim() ||
                (payment && (!amount || !payee || currency.length !== 3))
              }
            >
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
