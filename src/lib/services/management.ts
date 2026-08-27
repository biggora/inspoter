import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type Decision,
  type DecisionActorKind,
  type DecisionEventType,
  type DecisionExecutionStatus,
  type DecisionStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createCardTx } from "@/lib/services/kanban";
import { createReminderTx } from "@/lib/services/calendar";
import { createNoteTx } from "@/lib/services/notes";
import { enqueueNoteIndexTx } from "@/lib/services/note-index";
import { saveMailDraftTx } from "@/lib/services/mail-drafts";
import { runMailAccountTransaction } from "@/lib/services/mail-locks";
import { enqueueWebhookEventTx } from "@/lib/services/outgoingWebhooks";
import type {
  CreateDecisionInput,
  DecisionTransitionInput,
  ManagementAction,
  RebindDecisionInput,
  UpdateDecisionInput,
} from "@/lib/validation/management";
import { managementActionSchema } from "@/lib/validation/management";

export interface ManagementActor {
  kind: DecisionActorKind;
  id: string;
  name: string;
}

export class ManagementError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ManagementError";
  }
}

export interface ManagementKanbanTarget {
  id: string;
  name: string;
  columns: Array<{
    id: string;
    name: string;
    isDone: boolean;
  }>;
}

export async function listManagementKanbanTargets(
  workspaceId: string,
): Promise<ManagementKanbanTarget[]> {
  return db.kanbanBoard.findMany({
    where: { workspaceId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      columns: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, name: true, isDone: true },
      },
    },
  });
}

const notFound = () =>
  new ManagementError(
    "MANAGEMENT_DECISION_NOT_FOUND",
    404,
    "Decision not found.",
  );

export function actionPayload(
  action: ManagementAction,
): Prisma.InputJsonObject {
  switch (action.type) {
    case "CREATE_KANBAN_CARD":
      return {
        columnId: action.payload.columnId,
        title: action.payload.title,
        ...(action.payload.description !== undefined
          ? { description: action.payload.description }
          : {}),
        ...(action.payload.priority
          ? { priority: action.payload.priority }
          : {}),
        ...(action.payload.dueDate !== undefined
          ? { dueDate: action.payload.dueDate }
          : {}),
        ...(action.payload.assigneeOperatorId !== undefined
          ? { assigneeOperatorId: action.payload.assigneeOperatorId }
          : {}),
        ...(action.payload.labelIds
          ? { labelIds: action.payload.labelIds }
          : {}),
      };
    case "CREATE_REMINDER":
      return {
        title: action.payload.title,
        dueAt: action.payload.dueAt,
        ...(action.payload.description !== undefined
          ? { description: action.payload.description }
          : {}),
        ...(action.payload.links ? { links: action.payload.links } : {}),
      };
    case "CREATE_NOTE":
      return {
        title: action.payload.title,
        content: action.payload.content,
        ...(action.payload.folderId !== undefined
          ? { folderId: action.payload.folderId }
          : {}),
      };
    case "CREATE_MAIL_DRAFT":
      return {
        accountId: action.payload.accountId,
        to: action.payload.to,
        cc: action.payload.cc,
        bcc: action.payload.bcc,
        subject: action.payload.subject,
        bodyText: action.payload.bodyText,
        bodyHtml: action.payload.bodyHtml,
        ...(action.payload.inReplyToId !== undefined
          ? { inReplyToId: action.payload.inReplyToId }
          : {}),
        ...(action.payload.forwardOfId !== undefined
          ? { forwardOfId: action.payload.forwardOfId }
          : {}),
      };
  }
}

export function hashManagementAction(action: ManagementAction): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ type: action.type, payload: actionPayload(action) }),
    )
    .digest("hex");
}

async function nextEventSequence(
  tx: Prisma.TransactionClient,
  decisionId: string,
): Promise<number> {
  const latest = await tx.decisionEvent.findFirst({
    where: { decisionId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

interface EventInput {
  type: DecisionEventType;
  actor: ManagementActor;
  fromStatus?: DecisionStatus;
  toStatus?: DecisionStatus;
  fromExecutionStatus?: DecisionExecutionStatus;
  toExecutionStatus?: DecisionExecutionStatus;
  payloadHash?: string;
  target?: { type: string; id: string; label: string };
  error?: { code: string; message: string };
  receiptId?: string;
}

export async function appendDecisionEventTx(
  tx: Prisma.TransactionClient,
  decision: Pick<Decision, "id" | "workspaceId" | "actionRevision">,
  input: EventInput,
) {
  return tx.decisionEvent.create({
    data: {
      workspaceId: decision.workspaceId,
      decisionId: decision.id,
      decisionWorkspaceId: decision.workspaceId,
      receiptId: input.receiptId ?? null,
      receiptWorkspaceId: input.receiptId ? decision.workspaceId : null,
      sequence: await nextEventSequence(tx, decision.id),
      type: input.type,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      actorName: input.actor.name,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      fromExecutionStatus: input.fromExecutionStatus ?? null,
      toExecutionStatus: input.toExecutionStatus ?? null,
      actionRevision: decision.actionRevision,
      payloadHash: input.payloadHash ?? null,
      targetType: input.target?.type ?? null,
      targetId: input.target?.id ?? null,
      targetLabel: input.target?.label ?? null,
      errorCode: input.error?.code ?? null,
      errorMessage: input.error?.message ?? null,
    },
  });
}

export async function listDecisions(
  workspaceId: string,
  bucket: "active" | "deferred" | "resolved" = "active",
  now = new Date(),
) {
  const where: Prisma.DecisionWhereInput =
    bucket === "deferred"
      ? { workspaceId, status: "DEFERRED", deferredUntil: { gt: now } }
      : bucket === "resolved"
        ? {
            workspaceId,
            OR: [
              { status: "REJECTED" },
              {
                status: "APPROVED",
                executionStatus: { in: ["NONE", "SUCCEEDED"] },
              },
            ],
          }
        : {
            workspaceId,
            OR: [
              { status: "OPEN" },
              { status: "DEFERRED", deferredUntil: { lte: now } },
              {
                status: "APPROVED",
                executionStatus: {
                  in: ["READY", "RUNNING", "FAILED", "NEEDS_REBIND"],
                },
              },
            ],
          };
  return db.decision.findMany({
    where,
    orderBy: [
      { priority: "desc" },
      { dueAt: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 100,
    include: {
      brief: { select: { id: true, headline: true, publishedAt: true } },
      receipts: { orderBy: { actionRevision: "desc" }, take: 1 },
    },
  });
}

export async function getDecision(workspaceId: string, id: string) {
  const decision = await db.decision.findFirst({
    where: { id, workspaceId },
    include: {
      brief: true,
      receipts: { orderBy: { actionRevision: "desc" } },
      events: { orderBy: { sequence: "asc" } },
    },
  });
  if (!decision) throw notFound();
  return decision;
}

export async function createManualDecision(
  workspaceId: string,
  actor: ManagementActor,
  input: CreateDecisionInput,
) {
  return db.$transaction(async (tx) => {
    const actionRevision = input.action ? 1 : 0;
    const decision = await tx.decision.create({
      data: {
        workspaceId,
        origin: "MANUAL",
        title: input.title,
        context: input.context ?? null,
        recommendation: input.recommendation ?? null,
        priority: input.priority,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        actionType: input.action?.type ?? null,
        actionPayload: input.action
          ? actionPayload(input.action)
          : Prisma.DbNull,
        actionRevision,
        createdByType: actor.kind,
        createdById: actor.id,
        createdByName: actor.name,
      },
    });
    await appendDecisionEventTx(tx, decision, {
      type: "CREATED",
      actor,
      toStatus: "OPEN",
      toExecutionStatus: "NONE",
      payloadHash: input.action
        ? hashManagementAction(input.action)
        : undefined,
    });
    return decision;
  });
}

export async function updateDecision(
  workspaceId: string,
  id: string,
  actor: ManagementActor,
  input: UpdateDecisionInput,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.decision.findFirst({
      where: { id, workspaceId },
      include: { receipts: { select: { actionRevision: true } } },
    });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    const editable =
      current.status === "OPEN" ||
      current.status === "DEFERRED" ||
      (current.status === "APPROVED" &&
        current.executionStatus === "FAILED" &&
        !current.receipts.some(
          (receipt) => receipt.actionRevision === current.actionRevision,
        ));
    if (!editable) {
      throw new ManagementError(
        "DECISION_NOT_EDITABLE",
        409,
        "Decision can no longer be edited.",
      );
    }
    const actionChanged = input.action !== undefined;
    const nextRevision = actionChanged
      ? current.actionRevision + 1
      : current.actionRevision;
    const result = await tx.decision.updateMany({
      where: { id, workspaceId, version: input.expectedVersion },
      data: {
        version: { increment: 1 },
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        ...(input.recommendation !== undefined
          ? { recommendation: input.recommendation }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
        ...(actionChanged
          ? {
              actionType: input.action?.type ?? null,
              actionPayload: input.action
                ? actionPayload(input.action)
                : Prisma.DbNull,
              actionRevision: input.action ? nextRevision : 0,
              executionStatus:
                current.status === "APPROVED" && input.action
                  ? ("READY" as const)
                  : ("NONE" as const),
              lastExecutionErrorCode: null,
              lastExecutionError: null,
            }
          : {}),
      },
    });
    if (result.count !== 1) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    const updated = await tx.decision.findUniqueOrThrow({ where: { id } });
    await appendDecisionEventTx(tx, updated, {
      type: "UPDATED",
      actor,
      fromStatus: current.status,
      toStatus: updated.status,
      fromExecutionStatus: current.executionStatus,
      toExecutionStatus: updated.executionStatus,
      payloadHash: input.action
        ? hashManagementAction(input.action)
        : undefined,
    });
    return updated;
  });
}

export async function transitionDecision(
  workspaceId: string,
  id: string,
  actor: ManagementActor,
  input: DecisionTransitionInput,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.decision.findFirst({ where: { id, workspaceId } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    if (current.status !== "OPEN" && current.status !== "DEFERRED") {
      throw new ManagementError(
        "DECISION_TRANSITION_INVALID",
        409,
        "Decision is already resolved.",
      );
    }
    const now = new Date();
    const status: DecisionStatus =
      input.transition === "APPROVE"
        ? "APPROVED"
        : input.transition === "REJECT"
          ? "REJECTED"
          : "DEFERRED";
    const executionStatus: DecisionExecutionStatus =
      input.transition === "APPROVE" && current.actionType ? "READY" : "NONE";
    const result = await tx.decision.updateMany({
      where: { id, workspaceId, version: input.expectedVersion },
      data: {
        status,
        executionStatus,
        deferredUntil:
          input.transition === "DEFER" ? new Date(input.deferredUntil) : null,
        resolutionNote: input.note ?? null,
        resolvedByOperatorId: input.transition === "DEFER" ? null : actor.id,
        resolvedByOperatorName:
          input.transition === "DEFER" ? null : actor.name,
        resolvedAt: input.transition === "DEFER" ? null : now,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    const updated = await tx.decision.findUniqueOrThrow({ where: { id } });
    const eventType: DecisionEventType =
      input.transition === "APPROVE"
        ? "APPROVED"
        : input.transition === "REJECT"
          ? "REJECTED"
          : "DEFERRED";
    await appendDecisionEventTx(tx, updated, {
      type: eventType,
      actor,
      fromStatus: current.status,
      toStatus: status,
      fromExecutionStatus: current.executionStatus,
      toExecutionStatus: executionStatus,
    });
    return updated;
  });
}

export async function rebindDecision(
  workspaceId: string,
  id: string,
  actor: ManagementActor,
  input: RebindDecisionInput,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.decision.findFirst({
      where: { id, workspaceId },
      include: { receipts: { select: { actionRevision: true } } },
    });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    if (
      current.status === "REJECTED" ||
      current.executionStatus === "SUCCEEDED" ||
      (current.executionStatus !== "NEEDS_REBIND" &&
        current.executionStatus !== "FAILED") ||
      current.receipts.some(
        (receipt) => receipt.actionRevision === current.actionRevision,
      )
    ) {
      throw new ManagementError(
        "DECISION_REBIND_INVALID",
        409,
        "Decision action cannot be rebound.",
      );
    }
    const actionRevision = current.actionRevision + 1;
    const executionStatus: DecisionExecutionStatus =
      current.status === "APPROVED" ? "READY" : "NONE";
    const result = await tx.decision.updateMany({
      where: { id, workspaceId, version: input.expectedVersion },
      data: {
        actionType: input.action.type,
        actionPayload: actionPayload(input.action),
        actionRevision,
        executionStatus,
        executionLeaseToken: null,
        executionLeaseExpiresAt: null,
        lastExecutionErrorCode: null,
        lastExecutionError: null,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    const updated = await tx.decision.findUniqueOrThrow({ where: { id } });
    await appendDecisionEventTx(tx, updated, {
      type: "ACTION_REBOUND",
      actor,
      fromStatus: current.status,
      toStatus: current.status,
      fromExecutionStatus: current.executionStatus,
      toExecutionStatus: executionStatus,
      payloadHash: hashManagementAction(input.action),
    });
    return updated;
  });
}

export function managementActionTargetId(decisionId: string, revision: number) {
  return `mgt-${revision}-${decisionId}-${randomUUID().slice(0, 8)}`;
}

interface ActionResult {
  type: string;
  id: string;
  label: string;
  href: string;
}

interface ClaimedDecision {
  id: string;
  workspaceId: string;
  actionRevision: number;
  leaseToken: string;
  action: ManagementAction;
}

class ManagementActionTargetNotFoundError extends Error {
  constructor() {
    super("Select an existing Kanban board and column.");
    this.name = "ManagementActionTargetNotFoundError";
  }
}

function safeExecutionError(error: unknown): { code: string; message: string } {
  if (error instanceof ManagementError) {
    return { code: error.code, message: error.message.slice(0, 1_000) };
  }
  if (error instanceof Error) {
    return {
      code: error.name.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase(),
      message: error.message.slice(0, 1_000),
    };
  }
  return {
    code: "MANAGEMENT_ACTION_FAILED",
    message: "Management action failed.",
  };
}

async function claimDecisionAction(
  workspaceId: string,
  decisionId: string,
  actor: ManagementActor,
  expectedVersion: number,
): Promise<ClaimedDecision> {
  return db.$transaction(async (tx) => {
    const current = await tx.decision.findFirst({
      where: { id: decisionId, workspaceId },
      include: { receipts: { select: { actionRevision: true } } },
    });
    if (!current) throw notFound();
    if (current.version !== expectedVersion) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    if (
      current.status !== "APPROVED" ||
      !current.actionType ||
      !current.actionPayload
    ) {
      throw new ManagementError(
        "DECISION_ACTION_NOT_READY",
        409,
        "Decision has no approved action.",
      );
    }
    if (
      current.receipts.some(
        (receipt) => receipt.actionRevision === current.actionRevision,
      ) ||
      current.executionStatus === "SUCCEEDED"
    ) {
      throw new ManagementError(
        "DECISION_ACTION_ALREADY_COMMITTED",
        409,
        "Decision action is already committed.",
      );
    }
    const now = new Date();
    const reclaimable =
      current.executionStatus === "READY" ||
      current.executionStatus === "FAILED" ||
      (current.executionStatus === "RUNNING" &&
        current.executionLeaseExpiresAt !== null &&
        current.executionLeaseExpiresAt <= now);
    if (!reclaimable) {
      throw new ManagementError(
        "DECISION_ACTION_IN_PROGRESS",
        409,
        "Decision action is already in progress.",
      );
    }
    const parsed = managementActionSchema.safeParse({
      type: current.actionType,
      payload: current.actionPayload,
    });
    if (!parsed.success) {
      throw new ManagementError(
        "DECISION_ACTION_INVALID",
        409,
        "Stored decision action is invalid and must be rebound.",
      );
    }
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + 2 * 60_000);
    const claimed = await tx.decision.updateMany({
      where: {
        id: decisionId,
        workspaceId,
        version: expectedVersion,
        executionStatus: current.executionStatus,
      },
      data: {
        executionStatus: "RUNNING",
        executionLeaseToken: leaseToken,
        executionLeaseExpiresAt: leaseExpiresAt,
        executionAttempts: { increment: 1 },
        lastExecutionErrorCode: null,
        lastExecutionError: null,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ManagementError(
        "DECISION_VERSION_STALE",
        409,
        "Decision has changed.",
      );
    }
    await appendDecisionEventTx(tx, current, {
      type:
        current.executionStatus === "FAILED"
          ? "ACTION_RETRIED"
          : "ACTION_STARTED",
      actor,
      fromStatus: current.status,
      toStatus: current.status,
      fromExecutionStatus: current.executionStatus,
      toExecutionStatus: "RUNNING",
      payloadHash: hashManagementAction(parsed.data),
    });
    return {
      id: current.id,
      workspaceId,
      actionRevision: current.actionRevision,
      leaseToken,
      action: parsed.data,
    };
  });
}

async function createActionTargetTx(
  tx: Prisma.TransactionClient,
  claim: ClaimedDecision,
  targetId: string,
): Promise<ActionResult> {
  const { workspaceId, action } = claim;
  switch (action.type) {
    case "CREATE_NOTE": {
      const note = await createNoteTx(
        tx,
        workspaceId,
        action.payload,
        targetId,
      );
      await enqueueNoteIndexTx(tx, workspaceId, note.id, note.version);
      return {
        type: "NOTE",
        id: note.id,
        label: note.title,
        href: `/notes?note=${note.id}`,
      };
    }
    case "CREATE_KANBAN_CARD": {
      const columnExists = await tx.kanbanColumn.findFirst({
        where: { id: action.payload.columnId, workspaceId },
        select: { id: true },
      });
      if (!columnExists) throw new ManagementActionTargetNotFoundError();
      const card = await createCardTx(
        tx,
        workspaceId,
        {
          ...action.payload,
          dueDate:
            action.payload.dueDate === undefined
              ? undefined
              : action.payload.dueDate === null
                ? null
                : new Date(action.payload.dueDate),
        },
        targetId,
      );
      const hydrated = await tx.kanbanCard.findUniqueOrThrow({
        where: { id: card.id },
        include: {
          assignee: { select: { operator: { select: { username: true } } } },
          labels: { include: { label: { select: { name: true } } } },
        },
      });
      await enqueueWebhookEventTx(
        tx,
        workspaceId,
        "KANBAN_CARD_CREATED",
        {
          cardId: hydrated.id,
          boardId: hydrated.boardId,
          columnId: hydrated.columnId,
          title: hydrated.title,
          priority: hydrated.priority,
          dueDate: hydrated.dueDate?.toISOString() ?? null,
          assignee: hydrated.assignee?.operator.username ?? null,
          labels: hydrated.labels.map((link) => link.label.name),
          linkedType: hydrated.linkedType,
          linkedId: hydrated.linkedId,
          linkedLabel: hydrated.linkedLabel,
          completedAt: hydrated.completedAt?.toISOString() ?? null,
        },
        `decision:${claim.id}:${claim.actionRevision}:kanban-created`,
      );
      return {
        type: "KANBAN_CARD",
        id: card.id,
        label: card.title,
        href: `/kanban/${hydrated.boardId}?card=${card.id}`,
      };
    }
    case "CREATE_REMINDER": {
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { timeZone: true },
      });
      const reminder = await createReminderTx(
        tx,
        workspaceId,
        {
          kind: "STANDARD",
          title: action.payload.title,
          description: action.payload.description,
          dueAt: action.payload.dueAt,
          timeZone: workspace.timeZone,
          recurrence: null,
          links: action.payload.links ?? [],
        },
        targetId,
      );
      return {
        type: "REMINDER",
        id: reminder.id,
        label: reminder.title,
        href: `/calendar?reminder=${reminder.id}`,
      };
    }
    case "CREATE_MAIL_DRAFT": {
      const draft = await saveMailDraftTx(
        tx,
        workspaceId,
        {
          ...action.payload,
          inReplyToId: action.payload.inReplyToId ?? undefined,
          forwardOfId: action.payload.forwardOfId ?? undefined,
        },
        targetId,
      );
      return {
        type: "MAIL_DRAFT",
        id: draft.id,
        label: draft.subject || "Draft",
        href: `/mail?item=${draft.id}`,
      };
    }
  }
}

async function commitClaimedAction(
  tx: Prisma.TransactionClient,
  claim: ClaimedDecision,
  actor: ManagementActor,
): Promise<ActionResult> {
  const current = await tx.decision.findFirst({
    where: {
      id: claim.id,
      workspaceId: claim.workspaceId,
      executionStatus: "RUNNING",
      executionLeaseToken: claim.leaseToken,
      executionLeaseExpiresAt: { gt: new Date() },
      actionRevision: claim.actionRevision,
    },
  });
  if (!current) {
    throw new ManagementError(
      "DECISION_ACTION_LEASE_LOST",
      409,
      "Decision action lease was lost.",
    );
  }
  const existing = await tx.decisionActionReceipt.findUnique({
    where: {
      decisionId_actionRevision: {
        decisionId: claim.id,
        actionRevision: claim.actionRevision,
      },
    },
  });
  if (existing) {
    throw new ManagementError(
      "DECISION_ACTION_ALREADY_COMMITTED",
      409,
      "Decision action is already committed.",
    );
  }
  const result = await createActionTargetTx(
    tx,
    claim,
    managementActionTargetId(claim.id, claim.actionRevision),
  );
  const receipt = await tx.decisionActionReceipt.create({
    data: {
      workspaceId: claim.workspaceId,
      decisionId: claim.id,
      decisionWorkspaceId: claim.workspaceId,
      actionRevision: claim.actionRevision,
      actionType: claim.action.type,
      payloadHash: hashManagementAction(claim.action),
      historicalTargetId: result.id,
      historicalTargetType: result.type,
      historicalTargetLabel: result.label,
      historicalTargetHref: result.href,
      liveTargetId: result.id,
      liveTargetHref: result.href,
      targetAvailability: "AVAILABLE",
    },
  });
  const completed = await tx.decision.updateMany({
    where: {
      id: claim.id,
      workspaceId: claim.workspaceId,
      executionStatus: "RUNNING",
      executionLeaseToken: claim.leaseToken,
      executionLeaseExpiresAt: { gt: new Date() },
      actionRevision: claim.actionRevision,
    },
    data: {
      executionStatus: "SUCCEEDED",
      executionLeaseToken: null,
      executionLeaseExpiresAt: null,
      lastExecutionErrorCode: null,
      lastExecutionError: null,
      executedAt: new Date(),
      resultType: result.type,
      resultId: result.id,
      resultLabel: result.label,
      resultHref: result.href,
      version: { increment: 1 },
    },
  });
  if (completed.count !== 1) {
    throw new ManagementError(
      "DECISION_ACTION_LEASE_LOST",
      409,
      "Decision action lease was lost.",
    );
  }
  await appendDecisionEventTx(tx, current, {
    type: "PRIMARY_COMMITTED",
    actor,
    receiptId: receipt.id,
    fromStatus: current.status,
    toStatus: current.status,
    fromExecutionStatus: "RUNNING",
    toExecutionStatus: "SUCCEEDED",
    payloadHash: receipt.payloadHash,
    target: result,
  });
  return result;
}

async function markActionFailed(
  claim: ClaimedDecision,
  actor: ManagementActor,
  error: unknown,
) {
  const targetNeedsRebind =
    claim.action.type === "CREATE_KANBAN_CARD" &&
    error instanceof ManagementActionTargetNotFoundError;
  const safe = targetNeedsRebind
    ? {
        code: "MANAGEMENT_KANBAN_TARGET_NOT_FOUND",
        message: "Select an existing Kanban board and column.",
      }
    : safeExecutionError(error);
  const executionStatus: DecisionExecutionStatus = targetNeedsRebind
    ? "NEEDS_REBIND"
    : "FAILED";
  await db.$transaction(async (tx) => {
    const current = await tx.decision.findFirst({
      where: {
        id: claim.id,
        workspaceId: claim.workspaceId,
        executionStatus: "RUNNING",
        executionLeaseToken: claim.leaseToken,
      },
    });
    if (!current) return;
    const receipt = await tx.decisionActionReceipt.findUnique({
      where: {
        decisionId_actionRevision: {
          decisionId: claim.id,
          actionRevision: claim.actionRevision,
        },
      },
    });
    if (receipt) return;
    await tx.decision.update({
      where: { id: current.id },
      data: {
        executionStatus,
        executionLeaseToken: null,
        executionLeaseExpiresAt: null,
        lastExecutionErrorCode: safe.code,
        lastExecutionError: safe.message,
        version: { increment: 1 },
      },
    });
    await appendDecisionEventTx(tx, current, {
      type: "ACTION_FAILED",
      actor,
      fromStatus: current.status,
      toStatus: current.status,
      fromExecutionStatus: "RUNNING",
      toExecutionStatus: executionStatus,
      error: safe,
      payloadHash: hashManagementAction(claim.action),
    });
  });
}

export async function executeDecisionAction(
  workspaceId: string,
  decisionId: string,
  actor: ManagementActor,
  expectedVersion: number,
) {
  const claim = await claimDecisionAction(
    workspaceId,
    decisionId,
    actor,
    expectedVersion,
  );
  try {
    if (claim.action.type === "CREATE_MAIL_DRAFT") {
      await runMailAccountTransaction(claim.action.payload.accountId, (tx) =>
        commitClaimedAction(tx, claim, actor),
      );
    } else {
      await db.$transaction((tx) => commitClaimedAction(tx, claim, actor));
    }
  } catch (error) {
    await markActionFailed(claim, actor, error);
    if (error instanceof ManagementError) throw error;
  }
  return getDecision(workspaceId, decisionId);
}

export async function approveAndExecuteDecision(
  workspaceId: string,
  decisionId: string,
  actor: ManagementActor,
  input: Extract<DecisionTransitionInput, { transition: "APPROVE" }>,
) {
  const approved = await transitionDecision(
    workspaceId,
    decisionId,
    actor,
    input,
  );
  if (approved.executionStatus !== "READY") return approved;
  return executeDecisionAction(
    workspaceId,
    decisionId,
    actor,
    approved.version,
  );
}
