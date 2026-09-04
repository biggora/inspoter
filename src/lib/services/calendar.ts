import { publishIndicatorChange } from "@/lib/services/indicator-events";
import {
  CalendarLinkTargetType,
  Prisma,
  ReminderKind,
  ReminderOccurrenceStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  expandRecurrence,
  nextRecurrence,
  previousRecurrence,
  truncateRecurrence,
} from "@/lib/calendar/recurrence";
import type {
  CalendarEventOccurrenceDto,
  CalendarLinkDto,
  CalendarRangeResponse,
  CalendarReminderOccurrenceDto,
  RecurrenceRuleInput,
} from "@/lib/calendar/types";
import {
  calendarEventSchema,
  calendarLinkSchema,
  recurrenceSchema,
  reminderSchema,
  type CalendarEventInput,
  type CalendarEventUpdateInput,
  type ReminderInput,
  type ReminderUpdateInput,
} from "@/lib/validation/calendar";
import { assertCalendarLinkTargets } from "@/lib/services/calendar-link-targets";

const MAX_EXPANDED_OCCURRENCES = 5_000;

export class CalendarResourceNotFoundError extends Error {
  code = "CALENDAR_RESOURCE_NOT_FOUND" as const;
}

function recurrenceFrom(
  value: Prisma.JsonValue | null,
): RecurrenceRuleInput | null {
  if (!value) return null;
  const parsed = recurrenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function recurrenceJson(value: RecurrenceRuleInput | null | undefined) {
  return value ? (value as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
}

function linkDto(link: {
  id: string;
  targetType: CalendarLinkTargetType;
  targetId: string;
  targetLabel: string;
  targetHref: string | null;
  targetContext: Prisma.JsonValue | null;
  position: number;
}): CalendarLinkDto {
  return {
    id: link.id,
    targetType: link.targetType,
    targetId: link.targetId,
    targetLabel: link.targetLabel,
    targetHref: link.targetHref,
    targetContext:
      link.targetContext && !Array.isArray(link.targetContext)
        ? (link.targetContext as Record<string, unknown>)
        : null,
    position: link.position,
  };
}

function linkCreates(workspaceId: string, links: CalendarEventInput["links"]) {
  return links.map((link, position) => ({
    workspaceId,
    targetType: link.targetType as CalendarLinkTargetType,
    targetId: link.targetId,
    targetLabel: link.targetLabel,
    targetHref: link.targetHref ?? null,
    targetContext: link.targetContext
      ? (link.targetContext as Prisma.InputJsonValue)
      : Prisma.DbNull,
    position,
  }));
}

export async function getWorkspaceTimeZone(
  workspaceId: string,
): Promise<string> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { timeZone: true },
  });
  return workspace?.timeZone ?? "UTC";
}

export async function listRange(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<CalendarRangeResponse> {
  const [timeZone, events, standaloneReminders, activeOccurrences] =
    await Promise.all([
      getWorkspaceTimeZone(workspaceId),
      db.calendarEvent.findMany({
        where: { workspaceId, isActive: true },
        include: {
          exceptions: true,
          links: { orderBy: { position: "asc" } },
          reminders: {
            where: { isActive: true },
            include: { links: { orderBy: { position: "asc" } } },
          },
        },
        orderBy: { startAt: "asc" },
      }),
      db.reminder.findMany({
        where: { workspaceId, calendarEventId: null, isActive: true },
        include: { links: { orderBy: { position: "asc" } } },
        orderBy: { dueAt: "asc" },
      }),
      db.reminderOccurrence.findMany({
        where: {
          workspaceId,
          OR: [
            { scheduledFor: { gte: from, lt: to } },
            { status: { in: ["DUE", "SNOOZED"] } },
          ],
        },
      }),
    ]);

  const occurrenceByKey = new Map(
    activeOccurrences.map((item) => [
      `${item.reminderId}:${item.scheduledFor.toISOString()}`,
      item,
    ]),
  );
  const eventDtos: CalendarEventOccurrenceDto[] = [];
  const reminderDtos: CalendarReminderOccurrenceDto[] = [];
  let truncated = false;

  for (const event of events) {
    const recurrence = recurrenceFrom(event.recurrence);
    const expanded = expandRecurrence(
      recurrence,
      event.startAt,
      event.timeZone,
      from,
      to,
      MAX_EXPANDED_OCCURRENCES,
    );
    truncated ||= expanded.truncated;
    const exceptions = new Map(
      event.exceptions.map((exception) => [
        exception.originalStartAt.toISOString(),
        exception,
      ]),
    );
    const duration = event.endAt.getTime() - event.startAt.getTime();

    for (const originalStart of expanded.dates) {
      const exception = exceptions.get(originalStart.toISOString());
      if (exception?.isCancelled) continue;
      const startAt = exception?.replacementStartAt ?? originalStart;
      const endAt =
        exception?.replacementEndAt ?? new Date(startAt.getTime() + duration);
      if (endAt <= from || startAt >= to) continue;
      eventDtos.push({
        id: `${event.id}:${originalStart.toISOString()}`,
        eventId: event.id,
        originalStartAt: originalStart.toISOString(),
        title: event.title,
        description: event.description,
        location: event.location,
        color: event.color,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay: event.allDay,
        timeZone: event.timeZone,
        recurring: Boolean(recurrence),
        recurrence,
        links: event.links.map(linkDto),
      });

      for (const reminder of event.reminders) {
        const triggerAt = new Date(
          startAt.getTime() - (reminder.offsetMinutes ?? 0) * 60_000,
        );
        if (triggerAt < from || triggerAt >= to) continue;
        reminderDtos.push(
          reminderOccurrenceDto(
            reminder,
            originalStart,
            triggerAt,
            occurrenceByKey.get(
              `${reminder.id}:${originalStart.toISOString()}`,
            ),
          ),
        );
      }
    }
  }

  for (const reminder of standaloneReminders) {
    if (!reminder.dueAt) continue;
    const recurrence = recurrenceFrom(reminder.recurrence);
    const expanded = expandRecurrence(
      recurrence,
      reminder.dueAt,
      reminder.timeZone,
      from,
      to,
      MAX_EXPANDED_OCCURRENCES,
    );
    truncated ||= expanded.truncated;
    for (const scheduledFor of expanded.dates) {
      reminderDtos.push(
        reminderOccurrenceDto(
          reminder,
          scheduledFor,
          scheduledFor,
          occurrenceByKey.get(`${reminder.id}:${scheduledFor.toISOString()}`),
        ),
      );
    }
  }

  const includedOccurrences = new Set(
    reminderDtos.flatMap((item) =>
      item.occurrenceId ? [item.occurrenceId] : [],
    ),
  );
  for (const occurrence of activeOccurrences) {
    if (includedOccurrences.has(occurrence.id)) continue;
    const reminder = await db.reminder.findFirst({
      where: { id: occurrence.reminderId, workspaceId },
      include: { links: { orderBy: { position: "asc" } } },
    });
    if (!reminder) continue;
    reminderDtos.push(
      reminderOccurrenceDto(
        reminder,
        occurrence.scheduledFor,
        occurrence.triggerAt,
        occurrence,
      ),
    );
  }

  return {
    events: eventDtos.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    reminders: reminderDtos.sort((a, b) =>
      a.triggerAt.localeCompare(b.triggerAt),
    ),
    truncated,
    timeZone,
  };
}

function reminderOccurrenceDto(
  reminder: {
    id: string;
    calendarEventId: string | null;
    kind: ReminderKind;
    title: string;
    description: string | null;
    recurrence: Prisma.JsonValue | null;
    amount: Prisma.Decimal | null;
    currency: string | null;
    payee: string | null;
    paymentReference: string | null;
    paymentUrl: string | null;
    links: Array<{
      id: string;
      targetType: CalendarLinkTargetType;
      targetId: string;
      targetLabel: string;
      targetHref: string | null;
      targetContext: Prisma.JsonValue | null;
      position: number;
    }>;
  },
  scheduledFor: Date,
  triggerAt: Date,
  occurrence?: {
    id: string;
    status: ReminderOccurrenceStatus;
    snoozedUntil: Date | null;
  },
): CalendarReminderOccurrenceDto {
  return {
    id: `${reminder.id}:${scheduledFor.toISOString()}`,
    occurrenceId: occurrence?.id ?? null,
    reminderId: reminder.id,
    calendarEventId: reminder.calendarEventId,
    kind: reminder.kind,
    title: reminder.title,
    description: reminder.description,
    scheduledFor: scheduledFor.toISOString(),
    triggerAt: triggerAt.toISOString(),
    status: occurrence?.status ?? "SCHEDULED",
    snoozedUntil: occurrence?.snoozedUntil?.toISOString() ?? null,
    amount: reminder.amount?.toString() ?? null,
    currency: reminder.currency,
    payee: reminder.payee,
    paymentReference: reminder.paymentReference,
    paymentUrl: reminder.paymentUrl,
    recurring: Boolean(reminder.recurrence),
    recurrence: recurrenceFrom(reminder.recurrence),
    links: reminder.links.map(linkDto),
  };
}

export async function createEvent(
  workspaceId: string,
  rawInput: CalendarEventInput,
) {
  const input = calendarEventSchema.parse(rawInput);
  await assertCalendarLinkTargets(workspaceId, input.links);
  return db.$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        workspaceId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        color: input.color,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        allDay: input.allDay,
        timeZone: input.timeZone,
        recurrence: recurrenceJson(input.recurrence),
        links: { create: linkCreates(workspaceId, input.links) },
      },
      include: { links: true },
    });
    for (const offsetMinutes of [...new Set(input.reminderOffsets)]) {
      const nextTriggerAt = new Date(
        event.startAt.getTime() - offsetMinutes * 60_000,
      );
      await tx.reminder.create({
        data: {
          workspaceId,
          calendarEventId: event.id,
          calendarEventWorkspaceId: workspaceId,
          title: event.title,
          kind: ReminderKind.STANDARD,
          offsetMinutes,
          timeZone: event.timeZone,
          nextTriggerAt,
        },
      });
    }
    return event;
  });
}

export async function updateEvent(
  workspaceId: string,
  id: string,
  input: CalendarEventUpdateInput,
) {
  const existing = await db.calendarEvent.findFirst({
    where: { id, workspaceId },
    include: { links: true, reminders: { include: { links: true } } },
  });
  if (!existing) throw new CalendarResourceNotFoundError();
  if (input.links) {
    const existingTargets = new Set(
      existing.links.map((link) => `${link.targetType}:${link.targetId}`),
    );
    await assertCalendarLinkTargets(
      workspaceId,
      input.links.filter(
        (link) => !existingTargets.has(`${link.targetType}:${link.targetId}`),
      ),
    );
  }

  if (input.scope === "occurrence") {
    if (!input.originalStartAt || !input.startAt || !input.endAt) {
      throw new Error(
        "Occurrence updates require originalStartAt, startAt, and endAt",
      );
    }
    return db.calendarEventException.upsert({
      where: {
        calendarEventId_originalStartAt: {
          calendarEventId: id,
          originalStartAt: new Date(input.originalStartAt),
        },
      },
      create: {
        workspaceId,
        calendarEventId: id,
        eventWorkspaceId: workspaceId,
        originalStartAt: new Date(input.originalStartAt),
        replacementStartAt: new Date(input.startAt),
        replacementEndAt: new Date(input.endAt),
      },
      update: {
        isCancelled: false,
        replacementStartAt: new Date(input.startAt),
        replacementEndAt: new Date(input.endAt),
      },
    });
  }

  if (input.scope === "future") {
    if (!input.originalStartAt)
      throw new Error("Future updates require originalStartAt");
    const originalStart = new Date(input.originalStartAt);
    const recurrence = recurrenceFrom(existing.recurrence);
    if (!recurrence)
      return updateEvent(workspaceId, id, { ...input, scope: "series" });
    const previous = previousRecurrence(
      recurrence,
      existing.startAt,
      existing.timeZone,
      originalStart,
    );
    const nextStart = input.startAt ? new Date(input.startAt) : originalStart;
    const duration = existing.endAt.getTime() - existing.startAt.getTime();
    const nextEnd = input.endAt
      ? new Date(input.endAt)
      : new Date(nextStart.getTime() + duration);
    return db.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: {
          recurrence: recurrenceJson(
            truncateRecurrence(
              recurrence,
              previous ?? new Date(originalStart.getTime() - 1),
            ),
          ),
        },
      });
      return tx.calendarEvent.create({
        data: {
          workspaceId,
          title: input.title ?? existing.title,
          description:
            input.description === undefined
              ? existing.description
              : input.description,
          location:
            input.location === undefined ? existing.location : input.location,
          color: input.color ?? existing.color,
          startAt: nextStart,
          endAt: nextEnd,
          allDay: input.allDay ?? existing.allDay,
          timeZone: input.timeZone ?? existing.timeZone,
          recurrence: recurrenceJson(
            input.recurrence === undefined ? recurrence : input.recurrence,
          ),
          links: {
            create: linkCreates(
              workspaceId,
              input.links ??
                existing.links.map((link) => ({
                  targetType: link.targetType,
                  targetId: link.targetId,
                  targetLabel: link.targetLabel,
                  targetHref: link.targetHref,
                  targetContext: link.targetContext as Record<
                    string,
                    unknown
                  > | null,
                })),
            ),
          },
          reminders: {
            create: existing.reminders.map((reminder) => ({
              workspaceId,
              kind: reminder.kind,
              title: reminder.title,
              description: reminder.description,
              offsetMinutes: reminder.offsetMinutes,
              timeZone: input.timeZone ?? existing.timeZone,
              nextTriggerAt: new Date(
                nextStart.getTime() - (reminder.offsetMinutes ?? 0) * 60_000,
              ),
              amount: reminder.amount,
              currency: reminder.currency,
              payee: reminder.payee,
              paymentReference: reminder.paymentReference,
              paymentUrl: reminder.paymentUrl,
              links: {
                create: linkCreates(
                  workspaceId,
                  reminder.links.map((link) => ({
                    targetType: link.targetType,
                    targetId: link.targetId,
                    targetLabel: link.targetLabel,
                    targetHref: link.targetHref,
                    targetContext: link.targetContext as Record<
                      string,
                      unknown
                    > | null,
                  })),
                ),
              },
            })),
          },
        },
      });
    });
  }

  return db.$transaction(async (tx) => {
    if (input.links) {
      await tx.calendarLink.deleteMany({
        where: { workspaceId, calendarEventId: id },
      });
    }
    const updated = await tx.calendarEvent.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.startAt !== undefined
          ? { startAt: new Date(input.startAt) }
          : {}),
        ...(input.endAt !== undefined ? { endAt: new Date(input.endAt) } : {}),
        ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
        ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
        ...(input.recurrence !== undefined
          ? { recurrence: recurrenceJson(input.recurrence) }
          : {}),
        ...(input.links
          ? { links: { create: linkCreates(workspaceId, input.links) } }
          : {}),
      },
      include: { links: true },
    });
    if (input.startAt !== undefined || input.timeZone !== undefined) {
      for (const reminder of existing.reminders) {
        await tx.reminder.update({
          where: { id: reminder.id },
          data: {
            nextTriggerAt: new Date(
              updated.startAt.getTime() -
                (reminder.offsetMinutes ?? 0) * 60_000,
            ),
            isActive: true,
            timeZone: updated.timeZone,
          },
        });
      }
    }
    return updated;
  });
}

export async function deleteEvent(
  workspaceId: string,
  id: string,
  scope: "occurrence" | "future" | "series",
  originalStartAt?: string,
) {
  const event = await db.calendarEvent.findFirst({
    where: { id, workspaceId },
  });
  if (!event) throw new CalendarResourceNotFoundError();
  if (scope === "series") {
    await db.calendarEvent.delete({ where: { id } });
    return;
  }
  if (!originalStartAt) throw new Error("Occurrence date is required");
  const original = new Date(originalStartAt);
  if (scope === "occurrence") {
    await db.calendarEventException.upsert({
      where: {
        calendarEventId_originalStartAt: {
          calendarEventId: id,
          originalStartAt: original,
        },
      },
      create: {
        workspaceId,
        calendarEventId: id,
        eventWorkspaceId: workspaceId,
        originalStartAt: original,
        isCancelled: true,
      },
      update: {
        isCancelled: true,
        replacementStartAt: null,
        replacementEndAt: null,
      },
    });
    return;
  }
  const recurrence = recurrenceFrom(event.recurrence);
  if (!recurrence) {
    await db.calendarEvent.delete({ where: { id } });
    return;
  }
  const previous = previousRecurrence(
    recurrence,
    event.startAt,
    event.timeZone,
    original,
  );
  await db.calendarEvent.update({
    where: { id },
    data: {
      recurrence: recurrenceJson(
        truncateRecurrence(
          recurrence,
          previous ?? new Date(original.getTime() - 1),
        ),
      ),
    },
  });
}

export async function createReminder(
  workspaceId: string,
  rawInput: ReminderInput,
) {
  return db.$transaction((tx) => createReminderTx(tx, workspaceId, rawInput));
}

export async function createReminderTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  rawInput: ReminderInput,
  preferredId?: string,
) {
  const input = reminderSchema.parse(rawInput);
  await assertCalendarLinkTargets(workspaceId, input.links, tx);
  let event: { id: string; startAt: Date; timeZone: string } | null = null;
  if (input.calendarEventId) {
    event = await tx.calendarEvent.findFirst({
      where: { id: input.calendarEventId, workspaceId },
      select: { id: true, startAt: true, timeZone: true },
    });
    if (!event) throw new CalendarResourceNotFoundError();
  }
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const nextTriggerAt = event
    ? new Date(event.startAt.getTime() - (input.offsetMinutes ?? 0) * 60_000)
    : dueAt;
  return tx.reminder.create({
    data: {
      ...(preferredId ? { id: preferredId } : {}),
      workspaceId,
      calendarEventId: event?.id ?? null,
      calendarEventWorkspaceId: event ? workspaceId : null,
      kind:
        input.kind === "PAYMENT" ? ReminderKind.PAYMENT : ReminderKind.STANDARD,
      title: input.title,
      description: input.description ?? null,
      dueAt,
      offsetMinutes: event ? input.offsetMinutes : null,
      timeZone: event?.timeZone ?? input.timeZone,
      recurrence: recurrenceJson(event ? null : input.recurrence),
      nextTriggerAt,
      amount: input.kind === "PAYMENT" ? input.amount : null,
      currency: input.kind === "PAYMENT" ? input.currency : null,
      payee: input.kind === "PAYMENT" ? input.payee : null,
      paymentReference:
        input.kind === "PAYMENT" ? input.paymentReference : null,
      paymentUrl: input.kind === "PAYMENT" ? input.paymentUrl : null,
      links: { create: linkCreates(workspaceId, input.links) },
    },
    include: { links: true },
  });
}

export async function updateReminder(
  workspaceId: string,
  id: string,
  input: ReminderUpdateInput,
) {
  const reminder = await db.reminder.findFirst({
    where: { id, workspaceId },
    include: { links: true },
  });
  if (!reminder) throw new CalendarResourceNotFoundError();
  if (input.links) {
    const existingTargets = new Set(
      reminder.links.map((link) => `${link.targetType}:${link.targetId}`),
    );
    await assertCalendarLinkTargets(
      workspaceId,
      input.links.filter(
        (link) => !existingTargets.has(`${link.targetType}:${link.targetId}`),
      ),
    );
  }
  const merged = reminderSchema.parse({
    calendarEventId:
      input.calendarEventId === undefined
        ? reminder.calendarEventId
        : input.calendarEventId,
    kind: input.kind ?? reminder.kind,
    title: input.title ?? reminder.title,
    description:
      input.description === undefined
        ? reminder.description
        : input.description,
    dueAt:
      input.dueAt === undefined
        ? (reminder.dueAt?.toISOString() ?? null)
        : input.dueAt,
    offsetMinutes:
      input.offsetMinutes === undefined
        ? reminder.offsetMinutes
        : input.offsetMinutes,
    timeZone: input.timeZone ?? reminder.timeZone,
    recurrence:
      input.recurrence === undefined
        ? recurrenceFrom(reminder.recurrence)
        : input.recurrence,
    amount:
      input.amount === undefined
        ? (reminder.amount?.toString() ?? null)
        : input.amount,
    currency: input.currency === undefined ? reminder.currency : input.currency,
    payee: input.payee === undefined ? reminder.payee : input.payee,
    paymentReference:
      input.paymentReference === undefined
        ? reminder.paymentReference
        : input.paymentReference,
    paymentUrl:
      input.paymentUrl === undefined ? reminder.paymentUrl : input.paymentUrl,
    links:
      input.links ??
      reminder.links.map((link) => ({
        targetType: link.targetType,
        targetId: link.targetId,
        targetLabel: link.targetLabel,
        targetHref: link.targetHref,
        targetContext: link.targetContext as Record<string, unknown> | null,
      })),
  });

  if (
    input.scope === "future" &&
    input.originalStartAt &&
    !reminder.calendarEventId &&
    recurrenceFrom(reminder.recurrence)
  ) {
    const originalStart = new Date(input.originalStartAt);
    const oldRecurrence = recurrenceFrom(reminder.recurrence)!;
    const previous = previousRecurrence(
      oldRecurrence,
      reminder.dueAt!,
      reminder.timeZone,
      originalStart,
    );
    const nextDueAt = input.dueAt ? new Date(input.dueAt) : originalStart;
    return db.$transaction(async (tx) => {
      await tx.reminder.update({
        where: { id },
        data: {
          recurrence: recurrenceJson(
            truncateRecurrence(
              oldRecurrence,
              previous ?? new Date(originalStart.getTime() - 1),
            ),
          ),
        },
      });
      return tx.reminder.create({
        data: {
          workspaceId,
          kind: merged.kind as ReminderKind,
          title: merged.title,
          description: merged.description ?? null,
          dueAt: nextDueAt,
          timeZone: merged.timeZone,
          recurrence: recurrenceJson(merged.recurrence),
          nextTriggerAt: nextDueAt,
          amount: merged.kind === "PAYMENT" ? merged.amount : null,
          currency: merged.kind === "PAYMENT" ? merged.currency : null,
          payee: merged.kind === "PAYMENT" ? merged.payee : null,
          paymentReference:
            merged.kind === "PAYMENT" ? merged.paymentReference : null,
          paymentUrl: merged.kind === "PAYMENT" ? merged.paymentUrl : null,
          links: { create: linkCreates(workspaceId, merged.links) },
        },
        include: { links: true },
      });
    });
  }

  let attachedEvent: { id: string; startAt: Date; timeZone: string } | null =
    null;
  if (merged.calendarEventId) {
    attachedEvent = await db.calendarEvent.findFirst({
      where: { id: merged.calendarEventId, workspaceId },
      select: { id: true, startAt: true, timeZone: true },
    });
    if (!attachedEvent) throw new CalendarResourceNotFoundError();
  }
  return db.$transaction(async (tx) => {
    if (input.links)
      await tx.calendarLink.deleteMany({
        where: { workspaceId, reminderId: id },
      });
    const dueAt = attachedEvent ? null : new Date(merged.dueAt!);
    const nextTriggerAt = attachedEvent
      ? new Date(
          attachedEvent.startAt.getTime() -
            (merged.offsetMinutes ?? 0) * 60_000,
        )
      : dueAt;
    return tx.reminder.update({
      where: { id },
      data: {
        calendarEventId: attachedEvent?.id ?? null,
        calendarEventWorkspaceId: attachedEvent ? workspaceId : null,
        kind: merged.kind as ReminderKind,
        title: merged.title,
        description: merged.description ?? null,
        dueAt,
        offsetMinutes: attachedEvent ? merged.offsetMinutes : null,
        timeZone: attachedEvent?.timeZone ?? merged.timeZone,
        recurrence: recurrenceJson(attachedEvent ? null : merged.recurrence),
        nextTriggerAt,
        isActive: true,
        amount: merged.kind === "PAYMENT" ? merged.amount : null,
        currency: merged.kind === "PAYMENT" ? merged.currency : null,
        payee: merged.kind === "PAYMENT" ? merged.payee : null,
        paymentReference:
          merged.kind === "PAYMENT" ? merged.paymentReference : null,
        paymentUrl: merged.kind === "PAYMENT" ? merged.paymentUrl : null,
        ...(input.links
          ? { links: { create: linkCreates(workspaceId, input.links) } }
          : {}),
      },
      include: { links: true },
    });
  });
}

export async function deleteReminder(workspaceId: string, id: string) {
  const deleted = await db.reminder.deleteMany({ where: { id, workspaceId } });
  if (!deleted.count) throw new CalendarResourceNotFoundError();
}

export async function actOnOccurrence(
  workspaceId: string,
  id: string,
  action: "complete" | "skip" | "snooze",
  snoozeUntil?: Date,
) {
  const occurrence = await db.reminderOccurrence.findFirst({
    where: { id, workspaceId },
  });
  if (!occurrence) throw new CalendarResourceNotFoundError();
  const updated = await db.reminderOccurrence.update({
    where: { id },
    data:
      action === "snooze"
        ? { status: "SNOOZED", snoozedUntil: snoozeUntil, resolvedAt: null }
        : {
            status: action === "complete" ? "COMPLETED" : "SKIPPED",
            snoozedUntil: null,
            resolvedAt: new Date(),
          },
  });
  publishIndicatorChange(workspaceId, "calendar");
  return updated;
}

export async function countDueReminders(workspaceId: string): Promise<number> {
  return db.reminderOccurrence.count({
    where: { workspaceId, status: ReminderOccurrenceStatus.DUE },
  });
}

export async function processDueReminders(now = new Date(), batch = 100) {
  // Workspaces whose due count moved during this tick, so the publish below
  // wakes only the operators actually affected.
  const touched = new Set<string>();

  const unsnoozed = await db.reminderOccurrence.updateMany({
    where: { status: "SNOOZED", snoozedUntil: { lte: now } },
    data: { status: "DUE", snoozedUntil: null },
  });
  const due = await db.reminder.findMany({
    where: { isActive: true, nextTriggerAt: { lte: now } },
    include: { calendarEvent: true },
    orderBy: { nextTriggerAt: "asc" },
    take: batch,
  });

  for (const reminder of due) {
    if (!reminder.nextTriggerAt) continue;
    const recurrence = reminder.calendarEvent
      ? recurrenceFrom(reminder.calendarEvent.recurrence)
      : recurrenceFrom(reminder.recurrence);
    const anchor = reminder.calendarEvent?.startAt ?? reminder.dueAt;
    if (!anchor) continue;
    const timeZone = reminder.calendarEvent?.timeZone ?? reminder.timeZone;
    const offsetMs = (reminder.offsetMinutes ?? 0) * 60_000;
    let scheduledFor = reminder.calendarEvent
      ? new Date(reminder.nextTriggerAt.getTime() + offsetMs)
      : reminder.nextTriggerAt;
    let triggerAt = reminder.nextTriggerAt;

    if (reminder.kind === "STANDARD" && recurrence) {
      const latestAnchor = previousRecurrence(
        recurrence,
        anchor,
        timeZone,
        new Date(now.getTime() + offsetMs + 1),
      );
      if (latestAnchor) {
        scheduledFor = latestAnchor;
        triggerAt = new Date(latestAnchor.getTime() - offsetMs);
      }
    }

    const nextAnchor = recurrence
      ? nextRecurrence(recurrence, anchor, timeZone, scheduledFor)
      : null;
    const nextTriggerAt = nextAnchor
      ? new Date(nextAnchor.getTime() - offsetMs)
      : null;

    await db.$transaction(async (tx) => {
      const claimed = await tx.reminder.updateMany({
        where: { id: reminder.id, nextTriggerAt: reminder.nextTriggerAt },
        data: { nextTriggerAt, isActive: Boolean(nextTriggerAt) },
      });
      if (!claimed.count) return;
      touched.add(reminder.workspaceId);
      await tx.reminderOccurrence.upsert({
        where: {
          reminderId_scheduledFor: {
            reminderId: reminder.id,
            scheduledFor,
          },
        },
        create: {
          workspaceId: reminder.workspaceId,
          reminderId: reminder.id,
          reminderWorkspaceId: reminder.workspaceId,
          scheduledFor,
          triggerAt,
        },
        update: {},
      });
    });
  }

  // This scheduler is exactly the case the live indicator transport exists
  // for: a reminder falls due with the operator touching nothing, and the
  // badge has to move on its own. An unsnooze can span workspaces we did not
  // otherwise touch, so that path refreshes every affected one.
  if (unsnoozed.count > 0) {
    for (const workspaceId of await workspaceIdsWithDueOccurrences()) {
      touched.add(workspaceId);
    }
  }
  for (const workspaceId of touched) {
    publishIndicatorChange(workspaceId, "calendar");
  }
  return due.length;
}

async function workspaceIdsWithDueOccurrences(): Promise<string[]> {
  const rows = await db.reminderOccurrence.findMany({
    where: { status: "DUE" },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
  });
  return rows.map((row) => row.workspaceId);
}

export function validateLinkInput(value: unknown) {
  return calendarLinkSchema.parse(value);
}
