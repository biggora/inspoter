import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  CalendarResourceNotFoundError,
  createEvent,
  createReminder,
  listRange,
  processDueReminders,
  updateEvent,
} from "@/lib/services/calendar";
import * as backupService from "@/lib/services/backup";

const runId = randomUUID();
let workspaceA: string;
let workspaceB: string;
let workspaceC: string;

beforeAll(async () => {
  const [a, b, c] = await Promise.all([
    db.workspace.create({
      data: { name: "Calendar A", slug: `calendar-a-${runId}` },
    }),
    db.workspace.create({
      data: { name: "Calendar B", slug: `calendar-b-${runId}` },
    }),
    db.workspace.create({
      data: { name: "Calendar C", slug: `calendar-c-${runId}` },
    }),
  ]);
  workspaceA = a.id;
  workspaceB = b.id;
  workspaceC = c.id;
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceA, workspaceB, workspaceC] } },
  });
});

describe("calendar service", () => {
  it("expands event-linked reminders and isolates workspaces", async () => {
    const event = await createEvent(workspaceA, {
      title: "Daily stand-up",
      color: "BLUE",
      startAt: "2030-03-28T07:00:00.000Z",
      endAt: "2030-03-28T07:30:00.000Z",
      allDay: false,
      timeZone: "Europe/Riga",
      recurrence: { frequency: "DAILY", interval: 1 },
      links: [],
      reminderOffsets: [15],
    });

    const range = await listRange(
      workspaceA,
      new Date("2030-03-28T00:00:00.000Z"),
      new Date("2030-03-31T00:00:00.000Z"),
    );
    expect(range.events).toHaveLength(3);
    expect(range.reminders).toHaveLength(3);
    expect(range.reminders[0].calendarEventId).toBe(event.id);

    await expect(
      updateEvent(workspaceB, event.id, { title: "Foreign", scope: "series" }),
    ).rejects.toBeInstanceOf(CalendarResourceNotFoundError);
    await expect(
      listRange(
        workspaceB,
        new Date("2030-03-28T00:00:00.000Z"),
        new Date("2030-03-31T00:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ events: [], reminders: [] });
  });

  it("creates one ordinary catch-up occurrence for missed periods", async () => {
    const reminder = await createReminder(workspaceA, {
      kind: "STANDARD",
      title: "Review report",
      dueAt: "2031-01-01T09:00:00.000Z",
      timeZone: "UTC",
      recurrence: { frequency: "DAILY", interval: 1 },
      links: [],
    });

    await processDueReminders(new Date("2031-01-03T12:00:00.000Z"));
    const occurrences = await db.reminderOccurrence.findMany({
      where: { reminderId: reminder.id },
    });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].scheduledFor.toISOString()).toBe(
      "2031-01-03T09:00:00.000Z",
    );
  });

  it("keeps every missed payment period", async () => {
    const reminder = await createReminder(workspaceA, {
      kind: "PAYMENT",
      title: "Daily test payment",
      dueAt: "2032-01-01T09:00:00.000Z",
      timeZone: "UTC",
      recurrence: { frequency: "DAILY", interval: 1 },
      amount: "10.00",
      currency: "EUR",
      payee: "Test provider",
      links: [],
    });

    const now = new Date("2032-01-03T12:00:00.000Z");
    await processDueReminders(now);
    await processDueReminders(now);
    await processDueReminders(now);
    expect(
      await db.reminderOccurrence.count({ where: { reminderId: reminder.id } }),
    ).toBe(3);
  });

  it("claims a due reminder once across concurrent ticks", async () => {
    const reminder = await createReminder(workspaceA, {
      kind: "STANDARD",
      title: "One-time reminder",
      dueAt: "2033-01-01T09:00:00.000Z",
      timeZone: "UTC",
      links: [],
    });

    await Promise.all([
      processDueReminders(new Date("2033-01-01T10:00:00.000Z")),
      processDueReminders(new Date("2033-01-01T10:00:00.000Z")),
    ]);
    expect(
      await db.reminderOccurrence.count({ where: { reminderId: reminder.id } }),
    ).toBe(1);
  });

  it("round-trips calendar data and unresolved soft links", async () => {
    const event = await db.calendarEvent.findFirstOrThrow({
      where: { workspaceId: workspaceA },
    });
    await db.calendarLink.create({
      data: {
        workspaceId: workspaceA,
        calendarEventId: event.id,
        eventWorkspaceId: workspaceA,
        targetType: "NOTE",
        targetId: "deleted-note-id",
        targetLabel: "Deleted note snapshot",
        targetHref: "/notes/deleted-note-id",
      },
    });

    const archive = await backupService.exportWorkspace(workspaceA, {
      passphrase: "calendar-backup-passphrase",
      sections: ["calendar"],
    });
    const summary = await backupService.importWorkspace(workspaceC, {
      mode: "merge",
      passphrase: "calendar-backup-passphrase",
      file: archive.buffer,
    });

    expect(summary.imported.calendarEvents).toBeGreaterThan(0);
    expect(summary.imported.reminders).toBeGreaterThan(0);
    await expect(
      db.calendarLink.findFirst({
        where: {
          workspaceId: workspaceC,
          targetId: "deleted-note-id",
        },
      }),
    ).resolves.toMatchObject({ targetLabel: "Deleted note snapshot" });
  });
});
