import type { LlmMessage } from "@/lib/llm/contract";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import * as llmService from "@/lib/services/llm";
import {
  CONVERSATION_SUMMARY_CLOSE,
  CONVERSATION_SUMMARY_OPEN,
} from "@/lib/agents/prompt";

interface ChatContextInput {
  workspaceId: string;
  conversationId: string;
  currentSequence: number;
  agentName: string;
  runId: string;
}

export interface ChatHistoryTurn {
  sequence: number;
  input: string;
  answer: string;
}

function turnLength(turn: ChatHistoryTurn): number {
  return turn.input.length + turn.answer.length;
}

function turnText(turn: ChatHistoryTurn): string {
  return `User:\n${turn.input}\n\nAssistant:\n${turn.answer}`;
}

function recentWithinBudget(
  turns: readonly ChatHistoryTurn[],
  budget: number,
): ChatHistoryTurn[] {
  const kept: ChatHistoryTurn[] = [];
  let used = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    if (kept.length > 0 && used + turnLength(turn) > budget) break;
    kept.unshift(turn);
    used += turnLength(turn);
  }
  return kept;
}

export function partitionTurnsForSummary(
  turns: readonly ChatHistoryTurn[],
  recentBudget: number,
): {
  older: ChatHistoryTurn[];
  recent: ChatHistoryTurn[];
  boundary: number | undefined;
} {
  const recent = recentWithinBudget(turns, recentBudget);
  const recentSequences = new Set(recent.map((turn) => turn.sequence));
  const older = turns.filter((turn) => !recentSequences.has(turn.sequence));
  return {
    older,
    recent,
    boundary: older[older.length - 1]?.sequence,
  };
}

export async function buildChatHistory(
  input: ChatContextInput,
): Promise<LlmMessage[]> {
  const conversation = await db.agentConversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
    select: {
      rollingSummary: true,
      summarizedThroughSequence: true,
    },
  });
  if (!conversation) return [];

  const rows = await db.agentRun.findMany({
    where: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      conversationSequence: {
        gt: conversation.summarizedThroughSequence,
        lt: input.currentSequence,
      },
      status: "SUCCEEDED",
      summary: { not: null },
    },
    select: { conversationSequence: true, input: true, summary: true },
    orderBy: { conversationSequence: "asc" },
  });
  const turns: ChatHistoryTurn[] = rows.flatMap((row) =>
    row.conversationSequence != null && row.input != null && row.summary != null
      ? [
          {
            sequence: row.conversationSequence,
            input: row.input,
            answer: row.summary,
          },
        ]
      : [],
  );

  let rollingSummary = conversation.rollingSummary;
  const totalChars =
    (rollingSummary?.length ?? 0) +
    turns.reduce((total, turn) => total + turnLength(turn), 0);
  let recent = turns;

  if (totalChars > env.AGENT_CHAT_HISTORY_MAX_CHARS && turns.length > 1) {
    const recentBudget = Math.floor(env.AGENT_CHAT_HISTORY_MAX_CHARS * 0.45);
    const partition = partitionTurnsForSummary(turns, recentBudget);
    recent = partition.recent;
    const { older, boundary } = partition;
    if (boundary !== undefined) {
      const result = await llmService.chat(
        input.workspaceId,
        { operatorId: `agent:${input.runId}`, operatorName: input.agentName },
        {
          system: [
            "Summarize the conversation faithfully for a future assistant.",
            "Keep decisions, constraints, facts and unresolved questions.",
            "Do not add facts. Do not include tool payloads or source excerpts.",
          ].join(" "),
          messages: [
            {
              role: "user",
              content: [
                rollingSummary
                  ? `Previous summary:\n${rollingSummary}`
                  : "Previous summary: none",
                "Turns to incorporate:",
                older.map(turnText).join("\n\n---\n\n"),
              ].join("\n\n"),
            },
          ],
          tools: [],
          maxTokens: 2_000,
        },
      );
      if (result.ok && result.data.text.trim()) {
        rollingSummary = result.data.text.trim();
        await db.agentConversation.updateMany({
          where: {
            id: input.conversationId,
            workspaceId: input.workspaceId,
            summarizedThroughSequence: conversation.summarizedThroughSequence,
          },
          data: {
            rollingSummary,
            summarizedThroughSequence: boundary,
          },
        });
      } else {
        recent = recentWithinBudget(
          turns,
          Math.max(
            env.AGENT_CHAT_HISTORY_MAX_CHARS - (rollingSummary?.length ?? 0),
            1_000,
          ),
        );
      }
    }
  }

  const messages: LlmMessage[] = [];
  if (rollingSummary) {
    messages.push({
      role: "user",
      content: `${CONVERSATION_SUMMARY_OPEN}\n${rollingSummary}\n${CONVERSATION_SUMMARY_CLOSE}`,
    });
  }
  for (const turn of recent) {
    messages.push({ role: "user", content: turn.input });
    messages.push({ role: "assistant", content: turn.answer });
  }
  return messages;
}
