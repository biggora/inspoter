import { z } from "zod";

import { CALENDAR_COLORS, RECURRENCE_FREQUENCIES } from "@/lib/calendar/types";
import { isValidTimeZone } from "@/lib/agents/schedule";

const isoDateTime = z.iso.datetime({ offset: true });
const timeZone = z
  .string()
  .max(100)
  .refine(isValidTimeZone, "Invalid time zone");

export const recurrenceSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z.number().int().min(1).max(365),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    monthlyMode: z.enum(["DAY_OF_MONTH", "NTH_WEEKDAY", "LAST_DAY"]).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    ordinal: z
      .number()
      .int()
      .min(-1)
      .max(5)
      .refine((value) => value !== 0)
      .optional(),
    end: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("NEVER") }),
        z.object({ type: z.literal("UNTIL"), until: isoDateTime }),
        z.object({
          type: z.literal("COUNT"),
          count: z.number().int().min(1).max(10_000),
        }),
      ])
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.frequency === "WEEKLY" && !value.weekdays?.length) {
      context.addIssue({
        code: "custom",
        message: "Select at least one weekday",
        path: ["weekdays"],
      });
    }
    if (value.frequency === "MONTHLY" && !value.monthlyMode) {
      context.addIssue({
        code: "custom",
        message: "Select a monthly pattern",
        path: ["monthlyMode"],
      });
    }
    if (value.monthlyMode === "DAY_OF_MONTH" && !value.monthDay) {
      context.addIssue({
        code: "custom",
        message: "Select a day of month",
        path: ["monthDay"],
      });
    }
    if (
      value.monthlyMode === "NTH_WEEKDAY" &&
      (value.weekday === undefined || !value.ordinal)
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a weekday and ordinal",
        path: ["weekday"],
      });
    }
  });

export const calendarLinkSchema = z
  .object({
    targetType: z.enum([
      "DASHBOARD",
      "BOOKMARK",
      "KANBAN_BOARD",
      "KANBAN_CARD",
      "NOTE",
      "AGENT",
      "AGENT_RUN",
      "AGENT_CONVERSATION",
      "DOMAIN",
      "SERVER",
      "HOSTING_ACCOUNT",
      "SERVICE",
      "MAIL_ITEM",
      "MAIL_TEMPLATE",
      "CONTACT",
      "MESSAGE_CHANNEL",
      "MESSAGE",
      "ACTIVITY",
      "LOG",
      "ALERT",
      "EXTERNAL_URL",
    ]),
    targetId: z.string().trim().min(1).max(500),
    targetLabel: z.string().trim().min(1).max(200),
    targetHref: z.string().trim().max(2_000).nullable().optional(),
    targetContext: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.targetType !== "EXTERNAL_URL") return;
    try {
      const url = new URL(value.targetHref ?? value.targetId);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Enter an HTTP or HTTPS URL",
        path: ["targetHref"],
      });
    }
  });

const calendarEventBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  color: z.enum(CALENDAR_COLORS).default("BLUE"),
  startAt: isoDateTime,
  endAt: isoDateTime,
  allDay: z.boolean().default(false),
  timeZone,
  recurrence: recurrenceSchema.nullable().optional(),
  links: z.array(calendarLinkSchema).max(25).default([]),
  reminderOffsets: z
    .array(z.number().int().min(0).max(525_600))
    .max(10)
    .default([]),
});

export const calendarEventSchema = calendarEventBaseSchema.refine(
  (value) => new Date(value.endAt) > new Date(value.startAt),
  {
    message: "End must be after start",
    path: ["endAt"],
  },
);

export const calendarEventUpdateSchema = calendarEventBaseSchema
  .partial()
  .extend({
    scope: z.enum(["occurrence", "future", "series"]).default("series"),
    originalStartAt: isoDateTime.optional(),
  });

export const calendarEventDeleteSchema = z.object({
  scope: z.enum(["occurrence", "future", "series"]).default("series"),
  originalStartAt: isoDateTime.optional(),
});

const reminderBaseSchema = z.object({
  calendarEventId: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(["STANDARD", "PAYMENT"]).default("STANDARD"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
  offsetMinutes: z.number().int().min(0).max(525_600).nullable().optional(),
  timeZone,
  recurrence: recurrenceSchema.nullable().optional(),
  amount: z
    .string()
    .regex(/^\d{1,16}(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  payee: z.string().trim().min(1).max(200).nullable().optional(),
  paymentReference: z.string().trim().max(500).nullable().optional(),
  paymentUrl: z.string().url().max(2_000).nullable().optional(),
  links: z.array(calendarLinkSchema).max(25).default([]),
});

function validateReminder(
  value: z.infer<typeof reminderBaseSchema>,
  context: z.RefinementCtx,
) {
  const attached = Boolean(value.calendarEventId);
  if (attached === Boolean(value.dueAt)) {
    context.addIssue({
      code: "custom",
      message: "Choose either an event or a due date",
      path: ["dueAt"],
    });
  }
  if (attached && value.offsetMinutes == null) {
    context.addIssue({
      code: "custom",
      message: "Event reminders need an offset",
      path: ["offsetMinutes"],
    });
  }
  if (!attached && value.offsetMinutes != null) {
    context.addIssue({
      code: "custom",
      message: "Standalone reminders cannot use an offset",
      path: ["offsetMinutes"],
    });
  }
  if (
    value.kind === "PAYMENT" &&
    (!value.amount || !value.currency || !value.payee)
  ) {
    context.addIssue({
      code: "custom",
      message: "Payment amount, currency, and payee are required",
      path: ["amount"],
    });
  }
}

export const reminderSchema = reminderBaseSchema.superRefine(validateReminder);
export const reminderUpdateSchema = reminderBaseSchema.partial().extend({
  scope: z.enum(["future", "series"]).default("series"),
  originalStartAt: isoDateTime.optional(),
});

export const reminderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("snooze"), snoozeUntil: isoDateTime }),
]);

export const calendarRangeSchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((value) => {
    const duration =
      new Date(value.to).getTime() - new Date(value.from).getTime();
    return duration > 0 && duration <= 93 * 86_400_000;
  }, "Calendar range must be between 1 millisecond and 93 days");

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type CalendarEventUpdateInput = z.infer<
  typeof calendarEventUpdateSchema
>;
export type ReminderInput = z.infer<typeof reminderSchema>;
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;
