"use client";

import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type {
  RecurrenceFrequency,
  RecurrenceRuleInput,
} from "@/lib/calendar/types";

interface RecurrenceFieldsProps {
  value: RecurrenceRuleInput | null;
  onChange: (value: RecurrenceRuleInput | null) => void;
}

export function RecurrenceFields({ value, onChange }: RecurrenceFieldsProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const weekdays = Array.from({ length: 7 }, (_, day) => ({
    day,
    label: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 7, 30 + day))),
  }));
  const frequency = value?.frequency ?? "NONE";

  function setFrequency(next: string) {
    if (next === "NONE") return onChange(null);
    const nextFrequency = next as RecurrenceFrequency;
    onChange({
      frequency: nextFrequency,
      interval: 1,
      ...(nextFrequency === "WEEKLY"
        ? { weekdays: [new Date().getDay()] }
        : {}),
      ...(nextFrequency === "MONTHLY"
        ? {
            monthlyMode: "DAY_OF_MONTH" as const,
            monthDay: new Date().getDate(),
          }
        : {}),
      end: { type: "NEVER" },
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/25 p-3">
      <Field>
        <FieldLabel>{t("repeatLabel")}</FieldLabel>
        <NativeSelect
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="NONE">
            {t("repeatNone")}
          </NativeSelectOption>
          <NativeSelectOption value="DAILY">
            {t("frequencyDaily")}
          </NativeSelectOption>
          <NativeSelectOption value="WEEKLY">
            {t("frequencyWeekly")}
          </NativeSelectOption>
          <NativeSelectOption value="MONTHLY">
            {t("frequencyMonthly")}
          </NativeSelectOption>
          <NativeSelectOption value="YEARLY">
            {t("frequencyYearly")}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      {value && (
        <>
          <Field>
            <FieldLabel>{t("repeatEvery")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={value.interval}
                onChange={(event) =>
                  onChange({
                    ...value,
                    interval: Number(event.target.value) || 1,
                  })
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                {t(`frequency${titleCase(value.frequency)}`)}
              </span>
            </div>
          </Field>
          {value.frequency === "WEEKLY" && (
            <Field>
              <FieldLabel>{t("weekdaysLabel")}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {weekdays.map(({ day, label }) => {
                  const selected = value.weekdays?.includes(day) ?? false;
                  return (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() => {
                        const current = new Set(value.weekdays ?? []);
                        if (selected && current.size > 1) current.delete(day);
                        else current.add(day);
                        onChange({ ...value, weekdays: [...current].sort() });
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </Field>
          )}
          {value.frequency === "MONTHLY" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("monthlyModeLabel")}</FieldLabel>
                <NativeSelect
                  value={value.monthlyMode ?? "DAY_OF_MONTH"}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      monthlyMode: event.target
                        .value as RecurrenceRuleInput["monthlyMode"],
                      monthDay: value.monthDay ?? 1,
                      weekday: value.weekday ?? 1,
                      ordinal: value.ordinal ?? 1,
                    })
                  }
                  className="w-full"
                >
                  <NativeSelectOption value="DAY_OF_MONTH">
                    {t("monthlyDay")}
                  </NativeSelectOption>
                  <NativeSelectOption value="NTH_WEEKDAY">
                    {t("monthlyNth")}
                  </NativeSelectOption>
                  <NativeSelectOption value="LAST_DAY">
                    {t("monthlyLast")}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {value.monthlyMode === "DAY_OF_MONTH" && (
                <Field>
                  <FieldLabel>{t("monthlyDay")}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={value.monthDay ?? 1}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        monthDay: Number(event.target.value) || 1,
                      })
                    }
                  />
                </Field>
              )}
              {value.monthlyMode === "NTH_WEEKDAY" && (
                <div className="flex gap-2">
                  <NativeSelect
                    value={value.ordinal ?? 1}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        ordinal: Number(event.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, -1].map((number) => (
                      <NativeSelectOption key={number} value={number}>
                        {number === -1 ? t("lastOrdinal") : number}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    value={value.weekday ?? 1}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        weekday: Number(event.target.value),
                      })
                    }
                  >
                    {weekdays.map(({ day, label }) => (
                      <NativeSelectOption key={day} value={day}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </div>
          )}
          <Field>
            <FieldLabel>{t("endModeLabel")}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
              <NativeSelect
                value={value.end?.type ?? "NEVER"}
                onChange={(event) => {
                  const type = event.target.value;
                  onChange({
                    ...value,
                    end:
                      type === "UNTIL"
                        ? {
                            type,
                            until: new Date(
                              Date.now() + 90 * 86_400_000,
                            ).toISOString(),
                          }
                        : type === "COUNT"
                          ? { type, count: 10 }
                          : { type: "NEVER" },
                  });
                }}
                className="w-full"
              >
                <NativeSelectOption value="NEVER">
                  {t("endNever")}
                </NativeSelectOption>
                <NativeSelectOption value="UNTIL">
                  {t("endUntil")}
                </NativeSelectOption>
                <NativeSelectOption value="COUNT">
                  {t("endCount")}
                </NativeSelectOption>
              </NativeSelect>
              {value.end?.type === "UNTIL" && (
                <Input
                  type="date"
                  value={value.end.until.slice(0, 10)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      end: {
                        type: "UNTIL",
                        until: new Date(
                          `${event.target.value}T23:59:59.999Z`,
                        ).toISOString(),
                      },
                    })
                  }
                />
              )}
              {value.end?.type === "COUNT" && (
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={value.end.count}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      end: {
                        type: "COUNT",
                        count: Number(event.target.value) || 1,
                      },
                    })
                  }
                />
              )}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}

function titleCase(value: RecurrenceFrequency) {
  return `${value[0]}${value.slice(1).toLowerCase()}`;
}
