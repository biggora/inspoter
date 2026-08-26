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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  CalendarEventOccurrenceDto,
  CalendarLinkInput,
  RecurrenceRuleInput,
  SeriesScope,
} from "@/lib/calendar/types";
import {
  defaultLocalInput,
  instantToLocalInput,
  localInputToInstant,
} from "@/lib/calendar/client-time";
import { calendarApi } from "./api";
import { LinkPicker } from "./link-picker";
import { RecurrenceFields } from "./recurrence-fields";

export interface NewEventRange {
  startAt: string;
  endAt: string;
  allDay: boolean;
}

export function EventDialog({
  open,
  event,
  initialRange,
  timeZone,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  event: CalendarEventOccurrenceDto | null;
  initialRange: NewEventRange | null;
  timeZone: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("calendar");
  const identity = event?.id ?? `${initialRange?.startAt ?? "new"}:${open}`;
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState(defaultLocalInput(timeZone));
  const [endAt, setEndAt] = useState(defaultLocalInput(timeZone, 60));
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState("BLUE");
  const [recurrence, setRecurrence] = useState<RecurrenceRuleInput | null>(
    null,
  );
  const [links, setLinks] = useState<CalendarLinkInput[]>([]);
  const [offsets, setOffsets] = useState("30");
  const [scope, setScope] = useState<SeriesScope>("series");
  const [submitting, setSubmitting] = useState(false);

  if (identity !== previousIdentity) {
    setPreviousIdentity(identity);
    setTitle(event?.title ?? "");
    setDescription(event?.description ?? "");
    setLocation(event?.location ?? "");
    setStartAt(
      instantToLocalInput(
        event?.startAt ?? initialRange?.startAt ?? new Date().toISOString(),
        timeZone,
      ),
    );
    setEndAt(
      instantToLocalInput(
        event?.endAt ??
          initialRange?.endAt ??
          new Date(new Date().getTime() + 3_600_000).toISOString(),
        timeZone,
      ),
    );
    setAllDay(event?.allDay ?? initialRange?.allDay ?? false);
    setColor(event?.color ?? "BLUE");
    setRecurrence(event?.recurrence ?? null);
    setLinks(event?.links ?? []);
    setOffsets(event ? "" : "30");
    setScope(event?.recurring ? "occurrence" : "series");
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const input = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      color,
      startAt: localInputToInstant(startAt, timeZone),
      endAt: localInputToInstant(endAt, timeZone),
      allDay,
      timeZone,
      recurrence,
      links,
      reminderOffsets: offsets
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0),
    };
    try {
      if (event) {
        await calendarApi.updateEvent(event.eventId, {
          ...input,
          scope,
          originalStartAt: event.originalStartAt,
        });
      } else {
        await calendarApi.createEvent(input);
      }
      toast.success(t("saved"));
      onSaved();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!event) return;
    setSubmitting(true);
    try {
      await calendarApi.deleteEvent(
        event.eventId,
        scope,
        event.originalStartAt,
      );
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
            {event ? t("editEventTitle") : t("newEvent")}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("startLabel")}</FieldLabel>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t("endLabel")}</FieldLabel>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field orientation="horizontal">
            <Checkbox
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <FieldLabel>{t("allDayLabel")}</FieldLabel>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("locationLabel")}</FieldLabel>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("colorLabel")}</FieldLabel>
              <NativeSelect
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full"
              >
                {["BLUE", "GREEN", "AMBER", "RED", "VIOLET", "SLATE"].map(
                  (item) => (
                    <NativeSelectOption key={item} value={item}>
                      {item}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("descriptionLabel")}</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <RecurrenceFields value={recurrence} onChange={setRecurrence} />
          <Field>
            <FieldLabel>{t("remindersLabel")}</FieldLabel>
            <Input
              value={offsets}
              onChange={(e) => setOffsets(e.target.value)}
              placeholder={t("reminderOffsetsHint")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("linksLabel")}</FieldLabel>
            <LinkPicker value={links} onChange={setLinks} />
          </Field>
          {event?.recurring && (
            <Field>
              <FieldLabel>{t("scopeTitle")}</FieldLabel>
              <NativeSelect
                value={scope}
                onChange={(e) => setScope(e.target.value as SeriesScope)}
                className="w-full"
              >
                <NativeSelectOption value="occurrence">
                  {t("scopeOccurrence")}
                </NativeSelectOption>
                <NativeSelectOption value="future">
                  {t("scopeFuture")}
                </NativeSelectOption>
                <NativeSelectOption value="series">
                  {t("scopeSeries")}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          )}
          <DialogFooter>
            {event && (
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
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
