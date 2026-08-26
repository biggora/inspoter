import { Prisma } from "@/generated/prisma/client";
import { findMissingHistoricalScopes } from "@/lib/agents/conversation-scopes";
import { db } from "@/lib/db";
import { parseScopes, type McpScope } from "@/lib/mcp/scopes";
import { wakeAgentScheduler } from "@/lib/services/agent-scheduler";
import * as agentRunsService from "@/lib/services/agent-runs";

const PAGE_SIZE = 30;

export interface ConversationActor {
  operatorId: string;
  operatorName: string;
}

export class AgentConversationNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";
  constructor() {
    super("Conversation not found.");
  }
}

export class AgentConversationConflictError extends Error {
  readonly code = "AGENT_CONVERSATION_ACTIVE_TURN";
  constructor(message = "This conversation already has an active turn.") {
    super(message);
  }
}

export class AgentConversationUnavailableError extends Error {
  readonly code = "AGENT_CONVERSATION_UNAVAILABLE";
  constructor(message: string) {
    super(message);
  }
}

export class AgentConversationScopeDowngradeError extends Error {
  readonly code = "AGENT_SCOPE_DOWNGRADE_CONFIRMATION_REQUIRED";
  constructor(readonly missingScopes: McpScope[]) {
    super("Reassigning this conversation removes scopes used by its history.");
  }
}

function titleFromMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77).trimEnd()}…`;
}

function parseCursor(
  raw: string | undefined,
): { date: Date; id: string } | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf("|");
  if (separator < 1) return null;
  const date = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  return Number.isNaN(date.getTime()) || !id ? null : { date, id };
}

const CONVERSATION_SELECT = {
  id: true,
  title: true,
  agentId: true,
  agent: { select: { name: true, isActive: true } },
  archivedAt: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  runs: {
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true, status: true },
    take: 1,
  },
} satisfies Prisma.AgentConversationSelect;

type ConversationRow = Prisma.AgentConversationGetPayload<{
  select: typeof CONVERSATION_SELECT;
}>;

function toSummary(row: ConversationRow) {
  const { agent, runs, ...conversation } = row;
  return {
    ...conversation,
    agentName: agent?.name ?? null,
    agentActive: agent?.isActive ?? false,
    activeRun: runs[0] ?? null,
  };
}

export async function listConversations(
  workspaceId: string,
  query: { archived?: "true" | "false"; cursor?: string; limit?: number },
) {
  const limit = Math.min(query.limit ?? PAGE_SIZE, 50);
  const cursor = parseCursor(query.cursor);
  const rows = await db.agentConversation.findMany({
    where: {
      workspaceId,
      ...(query.archived === "true"
        ? { archivedAt: { not: null } }
        : query.archived === "false"
          ? { archivedAt: null }
          : {}),
      ...(cursor
        ? {
            OR: [
              { lastMessageAt: { lt: cursor.date } },
              { lastMessageAt: cursor.date, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: CONVERSATION_SELECT,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toSummary),
    nextCursor:
      rows.length > limit && last
        ? `${last.lastMessageAt.toISOString()}|${last.id}`
        : null,
  };
}

export async function getConversation(workspaceId: string, id: string) {
  const row = await db.agentConversation.findFirst({
    where: { id, workspaceId },
    select: {
      ...CONVERSATION_SELECT,
      createdByOperatorId: true,
      createdByOperatorName: true,
      rollingSummary: true,
      summarizedThroughSequence: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) throw new AgentConversationNotFoundError();
  const rawRuns = await agentRunsService.listConversationRuns(workspaceId, id);
  const sourceIds = rawRuns.flatMap((run) =>
    Array.isArray(run.ragSources)
      ? run.ragSources.flatMap((source) => {
          if (
            typeof source === "object" &&
            source !== null &&
            !Array.isArray(source) &&
            typeof source.noteId === "string"
          ) {
            return [source.noteId];
          }
          return [];
        })
      : [],
  );
  const existing = new Set(
    (
      await db.note.findMany({
        where: { workspaceId, id: { in: [...new Set(sourceIds)] } },
        select: { id: true },
      })
    ).map((note) => note.id),
  );
  const runs = rawRuns.map((run) => ({
    ...run,
    ragSources: Array.isArray(run.ragSources)
      ? run.ragSources.map((source) =>
          typeof source === "object" &&
          source !== null &&
          !Array.isArray(source) &&
          typeof source.noteId === "string"
            ? { ...source, available: existing.has(source.noteId) }
            : source,
        )
      : [],
  }));
  return { ...toSummary(row), events: row.events, runs };
}

async function queueMessage(
  workspaceId: string,
  conversation: { id: string; agentId: string | null; archivedAt: Date | null },
  message: string,
) {
  if (conversation.archivedAt) {
    throw new AgentConversationUnavailableError(
      "Archived conversations cannot receive messages.",
    );
  }
  if (!conversation.agentId) {
    throw new AgentConversationUnavailableError(
      "Assign an active agent before sending a message.",
    );
  }
  const sequence = await agentRunsService.nextConversationSequence(
    workspaceId,
    conversation.id,
  );
  const run = await agentRunsService.createRun(workspaceId, {
    agentId: conversation.agentId,
    trigger: "CHAT",
    idempotencyKey: `chat:${conversation.id}:${sequence}`,
    input: message,
    conversationId: conversation.id,
    conversationSequence: sequence,
  });
  if (!run) throw new AgentConversationConflictError();
  await db.agentConversation.update({
    where: { id_workspaceId: { id: conversation.id, workspaceId } },
    data: { lastMessageAt: new Date() },
  });
  wakeAgentScheduler();
  return run;
}

export async function createConversation(
  workspaceId: string,
  agentId: string,
  message: string,
  actor: ConversationActor,
) {
  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId, isActive: true },
    select: { id: true },
  });
  if (!agent) {
    throw new AgentConversationUnavailableError("Active agent not found.");
  }
  const conversation = await db.agentConversation.create({
    data: {
      workspaceId,
      agentId,
      agentWorkspaceId: workspaceId,
      title: titleFromMessage(message),
      createdByOperatorId: actor.operatorId,
      createdByOperatorName: actor.operatorName,
    },
    select: { id: true, agentId: true, archivedAt: true },
  });
  try {
    const run = await queueMessage(workspaceId, conversation, message);
    return { conversationId: conversation.id, run };
  } catch (error) {
    await db.agentConversation.deleteMany({
      where: { id: conversation.id, workspaceId },
    });
    throw error;
  }
}

export async function sendConversationMessage(
  workspaceId: string,
  id: string,
  message: string,
) {
  const conversation = await db.agentConversation.findFirst({
    where: { id, workspaceId },
    select: { id: true, agentId: true, archivedAt: true },
  });
  if (!conversation) throw new AgentConversationNotFoundError();
  return queueMessage(workspaceId, conversation, message);
}

export async function updateConversation(
  workspaceId: string,
  id: string,
  input: {
    title?: string;
    archived?: boolean;
    agentId?: string;
    acknowledgeScopeDowngrade?: boolean;
  },
  actor: ConversationActor,
) {
  const conversation = await db.agentConversation.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      agentId: true,
      agent: { select: { id: true, name: true, scopes: true } },
      runs: {
        where: { status: { in: ["PENDING", "RUNNING"] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!conversation) throw new AgentConversationNotFoundError();

  let nextAgent:
    | { id: string; name: string; scopes: string[]; isActive: boolean }
    | undefined;
  let missingScopes: McpScope[] = [];
  let previousSnapshot: {
    id: string;
    name: string;
    scopes: McpScope[];
  } | null = null;
  if (input.agentId && input.agentId !== conversation.agentId) {
    if (conversation.runs.length > 0)
      throw new AgentConversationConflictError();
    nextAgent =
      (await db.agent.findFirst({
        where: { id: input.agentId, workspaceId },
        select: { id: true, name: true, scopes: true, isActive: true },
      })) ?? undefined;
    if (!nextAgent?.isActive) {
      throw new AgentConversationUnavailableError("Active agent not found.");
    }
    const historical = await agentRunsService.getConversationScopeHistory(
      workspaceId,
      id,
    );
    previousSnapshot = conversation.agent
      ? {
          id: conversation.agent.id,
          name: conversation.agent.name,
          scopes: parseScopes(conversation.agent.scopes),
        }
      : await agentRunsService.getConversationLastAgentSnapshot(
          workspaceId,
          id,
        );
    missingScopes = findMissingHistoricalScopes(
      historical,
      parseScopes(nextAgent.scopes),
    );
    if (missingScopes.length > 0 && !input.acknowledgeScopeDowngrade) {
      throw new AgentConversationScopeDowngradeError(missingScopes);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.agentConversation.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.archived !== undefined
          ? { archivedAt: input.archived ? new Date() : null }
          : {}),
        ...(nextAgent
          ? {
              agentId: nextAgent.id,
              agentWorkspaceId: workspaceId,
            }
          : {}),
      },
    });
    if (nextAgent) {
      await tx.agentConversationEvent.create({
        data: {
          workspaceId,
          conversationId: id,
          conversationWorkspaceId: workspaceId,
          previousAgentId: previousSnapshot?.id ?? conversation.agentId,
          previousAgentName: previousSnapshot?.name ?? null,
          previousScopes: previousSnapshot?.scopes ?? [],
          nextAgentId: nextAgent.id,
          nextAgentName: nextAgent.name,
          nextScopes: nextAgent.scopes,
          actorOperatorId: actor.operatorId,
          actorOperatorName: actor.operatorName,
          scopeDowngradeConfirmed: missingScopes.length > 0,
          missingScopes,
        },
      });
    }
  });
  return getConversation(workspaceId, id);
}

export async function deleteConversation(
  workspaceId: string,
  id: string,
): Promise<void> {
  const active = await db.agentRun.count({
    where: {
      workspaceId,
      conversationId: id,
      status: { in: ["PENDING", "RUNNING"] },
    },
  });
  if (active > 0) throw new AgentConversationConflictError();
  const deleted = await db.agentConversation.deleteMany({
    where: { id, workspaceId },
  });
  if (deleted.count === 0) throw new AgentConversationNotFoundError();
}

export type AgentConversationSummary = Awaited<
  ReturnType<typeof listConversations>
>["items"][number];
export type AgentConversationDetail = Awaited<
  ReturnType<typeof getConversation>
>;
