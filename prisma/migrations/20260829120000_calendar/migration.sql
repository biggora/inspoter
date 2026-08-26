ALTER TABLE "Workspace" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TYPE "ReminderKind" AS ENUM ('STANDARD', 'PAYMENT');
CREATE TYPE "ReminderOccurrenceStatus" AS ENUM ('DUE', 'SNOOZED', 'COMPLETED', 'SKIPPED');
CREATE TYPE "CalendarLinkTargetType" AS ENUM (
  'DASHBOARD', 'BOOKMARK', 'KANBAN_BOARD', 'KANBAN_CARD', 'NOTE',
  'AGENT', 'AGENT_RUN', 'AGENT_CONVERSATION', 'DOMAIN', 'SERVER',
  'HOSTING_ACCOUNT', 'SERVICE', 'MAIL_ITEM', 'MAIL_TEMPLATE', 'CONTACT',
  'MESSAGE_CHANNEL', 'MESSAGE', 'ACTIVITY', 'LOG', 'ALERT', 'EXTERNAL_URL'
);

CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "color" TEXT NOT NULL DEFAULT 'BLUE',
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "recurrence" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEvent_time_range_check" CHECK ("endAt" > "startAt")
);

CREATE TABLE "CalendarEventException" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "calendarEventId" TEXT NOT NULL,
  "eventWorkspaceId" TEXT NOT NULL,
  "originalStartAt" TIMESTAMP(3) NOT NULL,
  "replacementStartAt" TIMESTAMP(3),
  "replacementEndAt" TIMESTAMP(3),
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEventException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEventException_shape_check" CHECK (
    ("isCancelled" = true AND "replacementStartAt" IS NULL AND "replacementEndAt" IS NULL)
    OR
    ("isCancelled" = false AND "replacementStartAt" IS NOT NULL AND "replacementEndAt" IS NOT NULL AND "replacementEndAt" > "replacementStartAt")
  )
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "calendarEventId" TEXT,
  "calendarEventWorkspaceId" TEXT,
  "kind" "ReminderKind" NOT NULL DEFAULT 'STANDARD',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" TIMESTAMP(3),
  "offsetMinutes" INTEGER,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "recurrence" JSONB,
  "nextTriggerAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "amount" DECIMAL(18,2),
  "currency" TEXT,
  "payee" TEXT,
  "paymentReference" TEXT,
  "paymentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reminder_schedule_shape_check" CHECK (
    ("calendarEventId" IS NULL AND "calendarEventWorkspaceId" IS NULL AND "dueAt" IS NOT NULL AND "offsetMinutes" IS NULL)
    OR
    ("calendarEventId" IS NOT NULL AND "calendarEventWorkspaceId" IS NOT NULL AND "dueAt" IS NULL AND "offsetMinutes" IS NOT NULL)
  ),
  CONSTRAINT "Reminder_payment_shape_check" CHECK (
    ("kind" = 'STANDARD' AND "amount" IS NULL AND "currency" IS NULL AND "payee" IS NULL AND "paymentReference" IS NULL AND "paymentUrl" IS NULL)
    OR
    ("kind" = 'PAYMENT' AND "amount" IS NOT NULL AND "amount" > 0 AND "currency" IS NOT NULL AND "payee" IS NOT NULL)
  )
);

CREATE TABLE "ReminderOccurrence" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reminderId" TEXT NOT NULL,
  "reminderWorkspaceId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "triggerAt" TIMESTAMP(3) NOT NULL,
  "status" "ReminderOccurrenceStatus" NOT NULL DEFAULT 'DUE',
  "snoozedUntil" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "calendarEventId" TEXT,
  "eventWorkspaceId" TEXT,
  "reminderId" TEXT,
  "reminderWorkspaceId" TEXT,
  "targetType" "CalendarLinkTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetContext" JSONB,
  "targetLabel" TEXT NOT NULL,
  "targetHref" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarLink_owner_check" CHECK (
    ("calendarEventId" IS NOT NULL AND "eventWorkspaceId" IS NOT NULL AND "reminderId" IS NULL AND "reminderWorkspaceId" IS NULL)
    OR
    ("calendarEventId" IS NULL AND "eventWorkspaceId" IS NULL AND "reminderId" IS NOT NULL AND "reminderWorkspaceId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "CalendarEvent_id_workspaceId_key" ON "CalendarEvent"("id", "workspaceId");
CREATE INDEX "CalendarEvent_workspaceId_startAt_id_idx" ON "CalendarEvent"("workspaceId", "startAt", "id");
CREATE INDEX "CalendarEvent_workspaceId_isActive_startAt_idx" ON "CalendarEvent"("workspaceId", "isActive", "startAt");
CREATE UNIQUE INDEX "CalendarEventException_calendarEventId_originalStartAt_key" ON "CalendarEventException"("calendarEventId", "originalStartAt");
CREATE INDEX "CalendarEventException_workspaceId_originalStartAt_idx" ON "CalendarEventException"("workspaceId", "originalStartAt");
CREATE UNIQUE INDEX "Reminder_id_workspaceId_key" ON "Reminder"("id", "workspaceId");
CREATE INDEX "Reminder_workspaceId_dueAt_id_idx" ON "Reminder"("workspaceId", "dueAt", "id");
CREATE INDEX "Reminder_isActive_nextTriggerAt_idx" ON "Reminder"("isActive", "nextTriggerAt");
CREATE INDEX "Reminder_workspaceId_calendarEventId_idx" ON "Reminder"("workspaceId", "calendarEventId");
CREATE UNIQUE INDEX "ReminderOccurrence_reminderId_scheduledFor_key" ON "ReminderOccurrence"("reminderId", "scheduledFor");
CREATE INDEX "ReminderOccurrence_workspaceId_status_triggerAt_idx" ON "ReminderOccurrence"("workspaceId", "status", "triggerAt");
CREATE INDEX "ReminderOccurrence_status_snoozedUntil_idx" ON "ReminderOccurrence"("status", "snoozedUntil");
CREATE INDEX "CalendarLink_workspaceId_calendarEventId_position_idx" ON "CalendarLink"("workspaceId", "calendarEventId", "position");
CREATE INDEX "CalendarLink_workspaceId_reminderId_position_idx" ON "CalendarLink"("workspaceId", "reminderId", "position");
CREATE INDEX "CalendarLink_workspaceId_targetType_targetId_idx" ON "CalendarLink"("workspaceId", "targetType", "targetId");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventException" ADD CONSTRAINT "CalendarEventException_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventException" ADD CONSTRAINT "CalendarEventException_calendarEventId_eventWorkspaceId_fkey" FOREIGN KEY ("calendarEventId", "eventWorkspaceId") REFERENCES "CalendarEvent"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_calendarEventId_calendarEventWorkspaceId_fkey" FOREIGN KEY ("calendarEventId", "calendarEventWorkspaceId") REFERENCES "CalendarEvent"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_reminderId_reminderWorkspaceId_fkey" FOREIGN KEY ("reminderId", "reminderWorkspaceId") REFERENCES "Reminder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_calendarEventId_eventWorkspaceId_fkey" FOREIGN KEY ("calendarEventId", "eventWorkspaceId") REFERENCES "CalendarEvent"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_reminderId_reminderWorkspaceId_fkey" FOREIGN KEY ("reminderId", "reminderWorkspaceId") REFERENCES "Reminder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
