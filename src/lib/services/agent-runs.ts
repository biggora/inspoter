import { randomUUID } from "node:crypto";
import { Prisma, type AgentRunStatus } from "@/generated/prisma/client";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { parseScopes, type McpScope } from "@/lib/mcp/scopes";
import { emitWebhookEvent } from "@/lib/services/webhook-events";

// Sole Prisma caller for AgentRun and AgentRunStep.
//
// AgentRun IS the work queue — there is no separate job table. One occurrence
// is one leased unit of work with no fan-out, which is the shape of
// MailFilterRun; MailFilterActionJob exists only because a filter run explodes
// into N per-message actions, and an agent run's tool calls happen inside its
// own lease instead.
//
// Every timestamp this module writes comes from `runtime.now()`, never from the
// database default. The claim query filters candidates against Node's clock,
// and mixing the two clocks is what made a freshly enqueued job briefly
// invisible in fc111d5.

export interface AgentRunRuntime {
  now: () => Date;
  leaseToken: () => string;
}

const DEFAULT_RUNTIME: AgentRunRuntime = {
  now: () => new Date(),
  leaseToken: randomUUID,
};

// Retry ladder for a run that failed for a reason worth retrying — a rate
// limit, mostly. Short enough that a nightly report is still current.
const BACKOFF_MS = [60_000, 300_000];

const LEASE_EXPIRED_ERROR = "Run lease expired before the run finished.";

export class AgentRunNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "AgentRunNotFoundError";
  }
}

export class AgentRunNotCancellableError extends Error {
  readonly code = "AGENT_RUN_NOT_CANCELLABLE";

  constructor() {
    super("This run has already finished.");
    this.name = "AgentRunNotCancellableError";
  }
}

export class AgentInactiveError extends Error {
  readonly code = "AGENT_INACTIVE";

  constructor() {
    super("This agent is paused.");
    this.name = "AgentInactiveError";
  }
}

/** Raised inside the runtime when another worker took over the lease. */
export class AgentRunLeaseLostError extends Error {
  constructor() {
    super("Agent run lease lost.");
    this.name = "AgentRunLeaseLostError";
  }
}

/** Report payload for AGENT_RUN_COMPLETED. Clamped so one long report cannot
 * dominate a Discord embed or a Telegram message. */
export const AGENT_REPORT_SUMMARY_MAX = 1_500;

export interface AgentRunSnapshotSkill {
  name: string;
  description: string;
  instructions: string;
  toolNames: string[];
}

export interface ClaimedAgentRun {
  id: string;
  workspaceId: string;
  leaseToken: string;
}

export interface AgentRunSummary {
  id: string;
  agentId: string | null;
  sourceAgentId: string;
  agentName: string;
  status: AgentRunStatus;
  trigger: "MANUAL" | "SCHEDULE" | "CHAT";
  conversationId: string | null;
  conversationSequence: number | null;
  ragMode: string | null;
  ragSources: Prisma.JsonValue;
  stepCount: number;
  toolCallCount: number;
  totalTokens: number;
  summary: string | null;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AgentRunStepView {
  id: string;
  index: number;
  kind: "MODEL_CALL" | "TOOL_CALL";
  toolName: string | null;
  argsJson: Prisma.JsonValue | null;
  resultText: string | null;
  isError: boolean;
  modelText: string | null;
  stopReason: string | null;
  durationMs: number;
  createdAt: Date;
}

export interface AgentRunDetail extends AgentRunSummary {
  input: string | null;
  scopes: McpScope[];
  steps: AgentRunStepView[];
  cancelRequestedAt: Date | null;
}

const SUMMARY_SELECT = {
  id: true,
  agentId: true,
  sourceAgentId: true,
  snapshotAgentName: true,
  status: true,
  trigger: true,
  conversationId: true,
  conversationSequence: true,
  ragMode: true,
  ragSources: true,
  stepCount: true,
  toolCallCount: true,
  totalTokens: true,
  summary: true,
  lastError: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} satisfies Prisma.AgentRunSelect;

type SummaryRow = Prisma.AgentRunGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow): AgentRunSummary {
  const { snapshotAgentName, ...rest } = row;
  return { ...rest, agentName: snapshotAgentName };
}

function leaseExpiry(now: Date): Date {
  return new Date(now.getTime() + env.AGENT_RUN_LEASE_MS);
}

/**
 * Trims and de-secrets a value before it becomes a step row. Step rows are
 * rendered in the run timeline, so anything shaped like a credential that a
 * tool echoed back must not survive the trip.
 */
export function sanitizeStepPayload(value: string | null): string | null {
  if (value === null) return null;
  const redacted = value
    .replace(/\b(sk|whsec|xoxb|ghp)[-_][A-Za-z0-9_-]{8,}/g, "$1_***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer ***");
  const max = env.AGENT_STEP_PAYLOAD_MAX_CHARS;
  return redacted.length <= max
    ? redacted
    : `${redacted.slice(0, max)}\n[truncated ${redacted.length - max} characters]`;
}

export interface CreateRunInput {
  agentId: string;
  trigger: "MANUAL" | "SCHEDULE" | "CHAT";
  /** Unique per occurrence; a MANUAL run gets a fresh uuid. */
  idempotencyKey: string;
  scheduleId?: string | null;
  input?: string | null;
  conversationId?: string | null;
  conversationSequence?: number | null;
}

/**
 * Snapshots the agent's configuration into a PENDING run. The snapshot is what
 * keeps a run explainable after the agent is edited or deleted, and it is also
 * what the runtime executes — so editing an agent never changes a run already
 * in flight.
 *
 * Returns null when the idempotency key is already taken, which is how two
 * scheduler ticks racing on one occurrence resolve to a single run.
 */
export async function createRun(
  workspaceId: string,
  input: CreateRunInput,
  runtime: AgentRunRuntime = DEFAULT_RUNTIME,
): Promise<AgentRunSummary | null> {
  const agent = await db.agent.findFirst({
    where: { id: input.agentId, workspaceId },
    select: {
      id: true,
      name: true,
      instructions: true,
      scopes: true,
      maxSteps: true,
      maxTokens: true,
      timeoutSeconds: true,
      isActive: true,
      skills: {
        select: {
          skill: {
            select: {
              name: true,
              description: true,
              instructions: true,
              toolNames: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ position: "asc" }, { skillId: "asc" }],
      },
    },
  });
  if (!agent) throw new AgentRunNotFoundError();
  if (!agent.isActive) throw new AgentInactiveError();

  // A paused skill stays attached but contributes nothing — pausing it is how
  // an operator takes a bad instruction out of every agent at once.
  const snapshotSkills: AgentRunSnapshotSkill[] = agent.skills
    .filter((link) => link.skill.isActive)
    .map((link) => ({
      name: link.skill.name,
      description: link.skill.description,
      instructions: link.skill.instructions,
      toolNames: link.skill.toolNames,
    }));

  const now = runtime.now();
  try {
    const created = await db.agentRun.create({
      data: {
        workspaceId,
        agentId: agent.id,
        agentWorkspaceId: workspaceId,
        sourceAgentId: agent.id,
        ...(input.conversationId
          ? {
              conversationId: input.conversationId,
              conversationWorkspaceId: workspaceId,
              conversationSequence: input.conversationSequence,
            }
          : {}),
        ...(input.scheduleId
          ? {
              scheduleId: input.scheduleId,
              scheduleWorkspaceId: workspaceId,
              sourceScheduleId: input.scheduleId,
            }
          : {}),
        snapshotAgentName: agent.name,
        snapshotInstructions: agent.instructions,
        snapshotScopes: agent.scopes,
        snapshotSkills: snapshotSkills as unknown as Prisma.InputJsonValue,
        snapshotMaxSteps: agent.maxSteps,
        snapshotMaxTokens: agent.maxTokens,
        snapshotTimeoutSeconds: agent.timeoutSeconds,
        input: input.input ?? null,
        trigger: input.trigger,
        idempotencyKey: input.idempotencyKey,
        nextAttemptAt: now,
      },
      select: SUMMARY_SELECT,
    });
    return toSummary(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}

export function createManualRun(
  workspaceId: string,
  agentId: string,
  task: string | null,
  runtime: AgentRunRuntime = DEFAULT_RUNTIME,
): Promise<AgentRunSummary | null> {
  return createRun(
    workspaceId,
    {
      agentId,
      trigger: "MANUAL",
      idempotencyKey: `manual:${runtime.leaseToken()}`,
      input: task,
    },
    runtime,
  );
}

/**
 * Takes ownership of due runs, oldest first.
 *
 * The claim is the optimistic `updateMany` guarded on the row's current state:
 * it counts only when exactly one row changed, so two processes can run this
 * concurrently and each gets a disjoint set. A per-workspace cap is applied
 * while claiming rather than afterwards — a workspace already at its limit must
 * not have its runs taken out of the queue and then dropped.
 */
export async function claimDueAgentRuns(
  limit: number,
  runtime: AgentRunRuntime = DEFAULT_RUNTIME,
): Promise<ClaimedAgentRun[]> {
  if (limit <= 0) return [];
  const now = runtime.now();

  const candidates = await db.agentRun.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    select: { id: true, workspaceId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(limit * 3, limit),
  });

  const running = new Map<string, number>();
  const claimed: ClaimedAgentRun[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;

    let inFlight = running.get(candidate.workspaceId);
    if (inFlight === undefined) {
      inFlight = await db.agentRun.count({
        where: { workspaceId: candidate.workspaceId, status: "RUNNING" },
      });
    }
    if (inFlight >= env.AGENT_MAX_CONCURRENT_RUNS_PER_WORKSPACE) {
      running.set(candidate.workspaceId, inFlight);
      continue;
    }

    const token = runtime.leaseToken();
    const result = await db.agentRun.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: {
        status: "RUNNING",
        leaseToken: token,
        leaseExpiresAt: leaseExpiry(now),
        startedAt: now,
      },
    });
    if (result.count === 1) {
      running.set(candidate.workspaceId, inFlight + 1);
      claimed.push({
        id: candidate.id,
        workspaceId: candidate.workspaceId,
        leaseToken: token,
      });
    }
  }
  return claimed;
}

/**
 * Returns a RUNNING row whose lease has expired to PENDING so another tick can
 * pick it up, or fails it once its attempts are spent. This is what recovers a
 * run whose process died mid-flight.
 */
export async function reclaimStaleAgentRuns(
  runtime: AgentRunRuntime = DEFAULT_RUNTIME,
): Promise<number> {
  const now = runtime.now();
  const stale = await db.agentRun.findMany({
    where: { status: "RUNNING", leaseExpiresAt: { lte: now } },
    select: {
      id: true,
      attempts: true,
      maxAttempts: true,
      leaseToken: true,
      cancelRequestedAt: true,
    },
    take: 50,
  });

  let reclaimed = 0;
  for (const run of stale) {
    const attempts = run.attempts + 1;
    // A run the operator cancelled while it was still running is not retried:
    // the lease expiring only confirms the process is gone.
    const terminal = run.cancelRequestedAt !== null;
    const exhausted = attempts >= run.maxAttempts;
    const result = await db.agentRun.updateMany({
      where: { id: run.id, status: "RUNNING", leaseToken: run.leaseToken },
      data: {
        attempts,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: LEASE_EXPIRED_ERROR,
        ...(terminal
          ? { status: "CANCELLED", completedAt: now }
          : exhausted
            ? { status: "FAILED", completedAt: now }
            : { status: "PENDING", nextAttemptAt: now }),
      },
    });
    reclaimed += result.count;
  }
  return reclaimed;
}

export async function renewAgentRunLease(
  claim: ClaimedAgentRun,
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<boolean> {
  const now = runtime.now();
  const result = await db.agentRun.updateMany({
    where: {
      id: claim.id,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
      leaseExpiresAt: { gt: now },
    },
    data: { leaseExpiresAt: leaseExpiry(now) },
  });
  return result.count === 1;
}

export interface AgentRunExecutionState {
  input: string | null;
  agentName: string;
  instructions: string;
  scopes: McpScope[];
  skills: AgentRunSnapshotSkill[];
  maxSteps: number;
  maxTokens: number;
  timeoutSeconds: number;
  stepCount: number;
  totalTokens: number;
  cancelRequestedAt: Date | null;
  trigger: "MANUAL" | "SCHEDULE" | "CHAT";
  conversationId: string | null;
  conversationSequence: number | null;
}

/** The snapshot the runtime executes, read once when the run starts. */
export async function loadRunState(
  claim: ClaimedAgentRun,
): Promise<AgentRunExecutionState> {
  const run = await db.agentRun.findFirst({
    where: { id: claim.id, workspaceId: claim.workspaceId },
    select: {
      input: true,
      snapshotAgentName: true,
      snapshotInstructions: true,
      snapshotScopes: true,
      snapshotSkills: true,
      snapshotMaxSteps: true,
      snapshotMaxTokens: true,
      snapshotTimeoutSeconds: true,
      stepCount: true,
      totalTokens: true,
      cancelRequestedAt: true,
      trigger: true,
      conversationId: true,
      conversationSequence: true,
    },
  });
  if (!run) throw new AgentRunNotFoundError();
  return {
    input: run.input,
    agentName: run.snapshotAgentName,
    instructions: run.snapshotInstructions,
    scopes: parseScopes(run.snapshotScopes),
    skills: run.snapshotSkills as unknown as AgentRunSnapshotSkill[],
    maxSteps: run.snapshotMaxSteps,
    maxTokens: run.snapshotMaxTokens,
    timeoutSeconds: run.snapshotTimeoutSeconds,
    stepCount: run.stepCount,
    totalTokens: run.totalTokens,
    cancelRequestedAt: run.cancelRequestedAt,
    trigger: run.trigger,
    conversationId: run.conversationId,
    conversationSequence: run.conversationSequence,
  };
}

export async function isCancelRequested(
  claim: ClaimedAgentRun,
): Promise<boolean> {
  const run = await db.agentRun.findFirst({
    where: { id: claim.id },
    select: { cancelRequestedAt: true },
  });
  return run?.cancelRequestedAt != null;
}

export async function saveRunRagSnapshot(
  claim: ClaimedAgentRun,
  ragMode: string,
  ragSources: Prisma.InputJsonValue,
): Promise<void> {
  const updated = await db.agentRun.updateMany({
    where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
    data: { ragMode, ragSources },
  });
  if (updated.count !== 1) throw new AgentRunLeaseLostError();
}

export interface AppendStepInput {
  index: number;
  kind: "MODEL_CALL" | "TOOL_CALL";
  toolName?: string | null;
  toolScope?: string | null;
  argsJson?: Prisma.InputJsonValue | null;
  resultText?: string | null;
  isError?: boolean;
  modelText?: string | null;
  stopReason?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
}

/**
 * Writes one step and advances the run's counters in the same transaction, so
 * the timeline and the totals can never disagree. Both writes are guarded on
 * the lease: a worker that lost the run must not keep appending to it.
 */
export async function appendStep(
  claim: ClaimedAgentRun,
  step: AppendStepInput,
): Promise<void> {
  const isToolCall = step.kind === "TOOL_CALL";
  await db.$transaction(async (tx) => {
    const updated = await tx.agentRun.updateMany({
      where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
      data: {
        stepCount: { increment: 1 },
        ...(isToolCall ? { toolCallCount: { increment: 1 } } : {}),
        promptTokens: { increment: step.promptTokens ?? 0 },
        completionTokens: { increment: step.completionTokens ?? 0 },
        totalTokens: {
          increment: (step.promptTokens ?? 0) + (step.completionTokens ?? 0),
        },
      },
    });
    if (updated.count !== 1) throw new AgentRunLeaseLostError();

    await tx.agentRunStep.create({
      data: {
        workspaceId: claim.workspaceId,
        runId: claim.id,
        runWorkspaceId: claim.workspaceId,
        index: step.index,
        kind: step.kind,
        toolName: step.toolName ?? null,
        toolScope: step.toolScope ?? null,
        ...(step.argsJson != null ? { argsJson: step.argsJson } : {}),
        resultText: sanitizeStepPayload(step.resultText ?? null),
        isError: step.isError ?? false,
        modelText: sanitizeStepPayload(step.modelText ?? null),
        stopReason: step.stopReason ?? null,
        promptTokens: step.promptTokens ?? 0,
        completionTokens: step.completionTokens ?? 0,
        durationMs: step.durationMs,
      },
    });
  });
}

export async function completeRun(
  claim: ClaimedAgentRun,
  outcome: { summary: string; stopReason: string },
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  const updated = await db.agentRun.updateMany({
    where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
    data: {
      status: "SUCCEEDED",
      summary: sanitizeStepPayload(outcome.summary),
      stopReason: outcome.stopReason,
      completedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) throw new AgentRunLeaseLostError();
  await touchAgentLastRun(claim, now);
}

/**
 * Fails the run, retrying it when the reason is transient and there are
 * attempts left. A rate limit is the case this exists for: the model is fine,
 * the hour is not.
 */
export async function failRun(
  claim: ClaimedAgentRun,
  error: { message: string; retryable: boolean },
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  await db.$transaction(async (tx) => {
    const run = await tx.agentRun.findFirst({
      where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
      select: { attempts: true, maxAttempts: true },
    });
    if (!run) return;
    const attempts = run.attempts + 1;
    const retry = error.retryable && attempts < run.maxAttempts;
    await tx.agentRun.updateMany({
      where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
      data: {
        attempts,
        lastError: sanitizeStepPayload(error.message),
        leaseToken: null,
        leaseExpiresAt: null,
        ...(retry
          ? {
              status: "PENDING",
              nextAttemptAt: new Date(
                now.getTime() +
                  (BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ??
                    BACKOFF_MS[BACKOFF_MS.length - 1]),
              ),
            }
          : { status: "FAILED", completedAt: now }),
      },
    });
  });
  await touchAgentLastRun(claim, now);
}

export async function markCancelled(
  claim: ClaimedAgentRun,
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  await db.agentRun.updateMany({
    where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
    data: {
      status: "CANCELLED",
      completedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });
  await touchAgentLastRun(claim, now);
}

/**
 * Emits AGENT_RUN_COMPLETED for a finished run, when its agent asked for it.
 *
 * A failure is a completion with `status: "FAILED"` — a separate
 * AGENT_RUN_FAILED member would double the subscription matrix an operator has
 * to reason about for no extra information.
 */
export async function emitRunReport(claim: ClaimedAgentRun): Promise<void> {
  const run = await db.agentRun.findFirst({
    where: { id: claim.id },
    select: {
      id: true,
      sourceAgentId: true,
      snapshotAgentName: true,
      status: true,
      trigger: true,
      startedAt: true,
      completedAt: true,
      stepCount: true,
      toolCallCount: true,
      totalTokens: true,
      stopReason: true,
      summary: true,
      lastError: true,
      agent: { select: { reportOnCompletion: true } },
    },
  });
  // No agent means it was deleted mid-run; there is nobody left whose
  // preference could ask for the report.
  if (!run?.agent?.reportOnCompletion) return;

  await emitWebhookEvent(claim.workspaceId, "AGENT_RUN_COMPLETED", {
    runId: run.id,
    agentId: run.sourceAgentId,
    agentName: run.snapshotAgentName,
    status: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    durationMs:
      run.startedAt && run.completedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : null,
    steps: run.stepCount,
    toolCalls: run.toolCallCount,
    totalTokens: run.totalTokens,
    stopReason: run.stopReason,
    summary: run.summary?.slice(0, AGENT_REPORT_SUMMARY_MAX) ?? null,
    error: run.lastError,
  });
}

// Best-effort: the agent may have been deleted while its run was in flight,
// which is exactly the case the SET NULL foreign key exists for.
async function touchAgentLastRun(
  claim: ClaimedAgentRun,
  now: Date,
): Promise<void> {
  const run = await db.agentRun.findFirst({
    where: { id: claim.id },
    select: { agentId: true },
  });
  if (!run?.agentId) return;
  await db.agent.updateMany({
    where: { id: run.agentId, workspaceId: claim.workspaceId },
    data: { lastRunAt: now },
  });
}

/**
 * Requests cancellation. A PENDING run is cancelled outright; a RUNNING one is
 * flagged, and the runtime notices at its next step boundary — it is already
 * writing a row there, so no extra query is needed.
 */
export async function cancelRun(
  workspaceId: string,
  id: string,
  runtime: Pick<AgentRunRuntime, "now"> = DEFAULT_RUNTIME,
): Promise<void> {
  const now = runtime.now();
  const flagged = await db.agentRun.updateMany({
    where: { id, workspaceId, status: { in: ["PENDING", "RUNNING"] } },
    data: { cancelRequestedAt: now },
  });
  if (flagged.count === 0) {
    const exists = await db.agentRun.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    throw exists
      ? new AgentRunNotCancellableError()
      : new AgentRunNotFoundError();
  }
  await db.agentRun.updateMany({
    where: { id, workspaceId, status: "PENDING" },
    data: { status: "CANCELLED", completedAt: now },
  });
}

export interface ListRunsQuery {
  agentId?: string;
  conversationId?: string;
  limit?: number;
  /** Keyset cursor, "<createdAt ISO>|<id>". */
  cursor?: string;
}

export interface ListRunsResult {
  items: AgentRunSummary[];
  nextCursor: string | null;
}

const RUNS_PAGE_SIZE = 50;

export async function listRuns(
  workspaceId: string,
  query: ListRunsQuery = {},
): Promise<ListRunsResult> {
  const limit = Math.min(query.limit ?? RUNS_PAGE_SIZE, RUNS_PAGE_SIZE);
  const cursor = parseCursor(query.cursor);

  const rows = await db.agentRun.findMany({
    where: {
      workspaceId,
      ...(query.agentId ? { sourceAgentId: query.agentId } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: SUMMARY_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toSummary),
    nextCursor:
      rows.length > limit && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null,
  };
}

function parseCursor(
  raw: string | undefined,
): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  return Number.isNaN(createdAt.getTime()) || !id ? null : { createdAt, id };
}

export async function getRunDetail(
  workspaceId: string,
  id: string,
): Promise<AgentRunDetail> {
  const run = await db.agentRun.findFirst({
    where: { id, workspaceId },
    select: {
      ...SUMMARY_SELECT,
      input: true,
      snapshotScopes: true,
      cancelRequestedAt: true,
      steps: {
        select: {
          id: true,
          index: true,
          kind: true,
          toolName: true,
          argsJson: true,
          resultText: true,
          isError: true,
          modelText: true,
          stopReason: true,
          durationMs: true,
          createdAt: true,
        },
        orderBy: { index: "asc" },
      },
    },
  });
  if (!run) throw new AgentRunNotFoundError();

  const { input, snapshotScopes, cancelRequestedAt, steps, ...summary } = run;
  return {
    ...toSummary(summary),
    input,
    scopes: parseScopes(snapshotScopes),
    cancelRequestedAt,
    steps,
  };
}

export async function listConversationRuns(
  workspaceId: string,
  conversationId: string,
): Promise<AgentRunDetail[]> {
  const rows = await db.agentRun.findMany({
    where: { workspaceId, conversationId },
    select: {
      ...SUMMARY_SELECT,
      input: true,
      snapshotScopes: true,
      cancelRequestedAt: true,
      steps: {
        select: {
          id: true,
          index: true,
          kind: true,
          toolName: true,
          argsJson: true,
          resultText: true,
          isError: true,
          modelText: true,
          stopReason: true,
          durationMs: true,
          createdAt: true,
        },
        orderBy: { index: "asc" },
      },
    },
    orderBy: { conversationSequence: "asc" },
  });
  return rows.map((run) => {
    const { input, snapshotScopes, cancelRequestedAt, steps, ...summary } = run;
    return {
      ...toSummary(summary),
      input,
      scopes: parseScopes(snapshotScopes),
      cancelRequestedAt,
      steps,
    };
  });
}

export async function getConversationScopeHistory(
  workspaceId: string,
  conversationId: string,
): Promise<McpScope[]> {
  const runs = await db.agentRun.findMany({
    where: { workspaceId, conversationId },
    select: { snapshotScopes: true },
  });
  return parseScopes([...new Set(runs.flatMap((run) => run.snapshotScopes))]);
}

export async function getConversationLastAgentSnapshot(
  workspaceId: string,
  conversationId: string,
): Promise<{ id: string; name: string; scopes: McpScope[] } | null> {
  const run = await db.agentRun.findFirst({
    where: { workspaceId, conversationId },
    select: {
      sourceAgentId: true,
      snapshotAgentName: true,
      snapshotScopes: true,
    },
    orderBy: { conversationSequence: "desc" },
  });
  return run
    ? {
        id: run.sourceAgentId,
        name: run.snapshotAgentName,
        scopes: parseScopes(run.snapshotScopes),
      }
    : null;
}

export async function nextConversationSequence(
  workspaceId: string,
  conversationId: string,
): Promise<number> {
  const latest = await db.agentRun.findFirst({
    where: { workspaceId, conversationId },
    select: { conversationSequence: true },
    orderBy: { conversationSequence: "desc" },
  });
  return (latest?.conversationSequence ?? 0) + 1;
}

/**
 * Deletes terminal runs older than the retention window, oldest first. PENDING
 * and RUNNING rows are never eligible regardless of age — the same rule
 * pruneOldDeliveries follows.
 */
export async function pruneOldRuns(
  olderThan: Date,
  batch = 500,
): Promise<number> {
  const doomed = await db.agentRun.findMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] },
      conversationId: null,
      createdAt: { lt: olderThan },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: batch,
  });
  if (doomed.length === 0) return 0;
  const result = await db.agentRun.deleteMany({
    where: { id: { in: doomed.map((run) => run.id) } },
  });
  return result.count;
}
