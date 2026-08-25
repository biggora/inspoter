"use client";

import { useId, useState, type FormEvent } from "react";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { AgentScheduleSummary } from "@/lib/services/agent-schedules";
import { agentSchedulesApi, ApiError } from "./api";

export type ScheduleDialogState =
  { mode: "create" } | { mode: "edit"; schedule: AgentScheduleSummary };

interface ScheduleDialogProps {
  agentId: string;
  state: ScheduleDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const KINDS = ["INTERVAL", "DAILY", "WEEKLY"] as const;
const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
] as const;

function minuteOfDayToTime(minutes: number | null): string {
  const value = minutes ?? 9 * 60;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function timeToMinuteOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

// The browser knows the operator's own zone; offering it as the default beats
// making them type an IANA name. The dashboard renders in UTC, so the form
// states the zone rather than implying it.
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function ScheduleDialog({
  agentId,
  state,
  onOpenChange,
  onSaved,
}: ScheduleDialogProps) {
  const t = useTranslations("agents");
  const nameId = useId();
  const nameErrorId = useId();
  const kindId = useId();
  const intervalId = useId();
  const timeId = useId();
  const zoneId = useId();
  const taskId = useId();
  const activeId = useId();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("DAILY");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [time, setTime] = useState(minuteOfDayToTime(null));
  const [timeZone, setTimeZone] = useState(browserTimeZone());
  const [days, setDays] = useState<number[]>([1]);
  const [task, setTask] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const schedule = state.schedule;
      setName(schedule.name);
      setKind(schedule.kind);
      setIntervalMinutes(String((schedule.intervalSeconds ?? 3_600) / 60));
      setTime(minuteOfDayToTime(schedule.minuteOfDay));
      setTimeZone(schedule.timeZone);
      setDays(schedule.daysOfWeek.length ? schedule.daysOfWeek : [1]);
      setTask(schedule.input ?? "");
      setIsActive(schedule.isActive);
    } else if (state?.mode === "create") {
      setName("");
      setKind("DAILY");
      setIntervalMinutes("60");
      setTime(minuteOfDayToTime(null));
      setTimeZone(browserTimeZone());
      setDays([1]);
      setTask("");
      setIsActive(true);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrors({ name: t("nameRequiredError") });
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      // Only the fields this kind reads are sent; the others go null so a kind
      // switch cannot leave a stale interval behind.
      const payload = {
        name: trimmedName,
        kind,
        intervalSeconds:
          kind === "INTERVAL" ? Number(intervalMinutes) * 60 : null,
        minuteOfDay: kind === "INTERVAL" ? null : timeToMinuteOfDay(time),
        daysOfWeek: kind === "WEEKLY" ? [...days].sort() : [],
        timeZone,
        input: task.trim() || null,
        isActive,
      };
      if (state?.mode === "edit") {
        await agentSchedulesApi.update(agentId, state.schedule.id, payload);
        toast.success(t("scheduleUpdatedToast"));
      } else {
        await agentSchedulesApi.create(agentId, payload);
        toast.success(t("scheduleCreatedToast"));
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setErrors({ name: err.fieldErrors.name });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveScheduleError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editScheduleTitle") : t("createScheduleTitle")}
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
                aria-required="true"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? nameErrorId : undefined}
                autoFocus
              />
              <FieldError id={nameErrorId}>{errors.name}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={kindId}>{t("scheduleKindLabel")}</FieldLabel>
              <NativeSelect
                id={kindId}
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as (typeof KINDS)[number])
                }
                className="w-full"
              >
                {KINDS.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {t(`scheduleKind${option}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            {kind === "INTERVAL" ? (
              <Field>
                <FieldLabel htmlFor={intervalId}>
                  {t("scheduleIntervalLabel")}
                </FieldLabel>
                <Input
                  id={intervalId}
                  type="number"
                  inputMode="numeric"
                  min={5}
                  step={5}
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                />
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor={timeId}>
                    {t("scheduleTimeLabel")}
                  </FieldLabel>
                  <Input
                    id={timeId}
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={zoneId}>
                    {t("scheduleTimeZoneLabel")}
                  </FieldLabel>
                  <Input
                    id={zoneId}
                    value={timeZone}
                    onChange={(event) => setTimeZone(event.target.value)}
                    spellCheck={false}
                  />
                  <FieldDescription>
                    {t("scheduleTimeZoneHint")}
                  </FieldDescription>
                </Field>
              </>
            )}

            {kind === "WEEKLY" ? (
              <Field>
                <FieldLabel>{t("scheduleDaysLabel")}</FieldLabel>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAY_KEYS.map((key, index) => {
                    const dayId = `${zoneId}-day-${index}`;
                    return (
                      <Field
                        key={key}
                        orientation="horizontal"
                        className="w-auto"
                      >
                        <Checkbox
                          id={dayId}
                          checked={days.includes(index)}
                          onCheckedChange={(checked) =>
                            setDays(
                              checked === true
                                ? [...days, index]
                                : days.filter((day) => day !== index),
                            )
                          }
                        />
                        <FieldLabel
                          htmlFor={dayId}
                          className="cursor-pointer font-normal"
                        >
                          {t(key)}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor={taskId}>{t("scheduleTaskLabel")}</FieldLabel>
              <Textarea
                id={taskId}
                value={task}
                onChange={(event) => setTask(event.target.value)}
                rows={3}
              />
              <FieldDescription>{t("runTaskHint")}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={activeId}
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel
                htmlFor={activeId}
                className="cursor-pointer font-normal"
              >
                {t("activeLabel")}
              </FieldLabel>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {isEdit ? t("savingButton") : t("creatingButton")}
                </>
              ) : isEdit ? (
                t("saveChangesButton")
              ) : (
                t("createButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
