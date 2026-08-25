import type { z } from "zod";
import type { LlmCompletionRequest, LlmResult } from "@/lib/llm/contract";
import { parseJsonAnswer } from "@/lib/llm/json";
import * as llmService from "@/lib/services/llm";
import {
  buildDraftContext,
  buildDraftMockAnswer,
  buildDraftPrompt,
  buildDraftSystemPrompt,
  FIELD_MAX_CHARS,
  trimToLimit,
} from "@/lib/agents/authoring-prompts";
import {
  agentDraftAnswerSchema,
  type AgentDraftInput,
  type AiDraftKind,
} from "@/lib/validation/agents-ai";

// The authoring assistant of the AI Assistant section: it drafts the
// Description or the Instructions of an agent or a skill from what the
// operator has typed so far (architecture.md §7F.7).
//
// This service imports no Prisma client at all — a stronger statement than
// its sibling mail-ai.ts, which at least loads the message it summarizes.
// Nothing is read and nothing is written: the draft travels to the dialog,
// the operator edits it, and the existing agentsService/skillsService saves
// the record only when they press Create. The fifth principle of
// specs/ai-integration.md applied to the product's own configuration.

// Cost ceilings, not a function of the field's character limit — mail already
// budgets 1024 tokens for a bodyText whose schema allows 8000 characters.
// 256 tokens is roughly 1000 Latin or 400 Cyrillic characters, comfortably
// above both description caps (280 and 200). The instructions budgets sit
// under their caps for the same reason: the prompt states the character
// budget, and max_tokens is only the backstop.
const DESCRIPTION_MAX_TOKENS = 256;
const INSTRUCTIONS_MAX_TOKENS: Record<AiDraftKind, number> = {
  AGENT: 1_536,
  SKILL: 1_024,
};

export interface AgentAiCaller {
  operatorId: string;
  operatorName: string;
}

export interface AgentDraftDto {
  text: string;
  // The model that actually answered, as the endpoint reported it. The driver
  // mode is deliberately not exposed, for the reason MailAiMeta gives.
  model: string;
  // The draft was longer than the target field accepts and was shortened.
  // Distinct from mail's `truncated`, which is about the INPUT.
  trimmed: boolean;
}

// The same four JSON defences as mail-ai.ts: the transport hint, the prompt
// contract from authoring-prompts.ts, defensive extraction, and zod. Copied
// rather than shared — mail's version is not exported, and lifting it into a
// common module would be a change to shipped code for one new caller.
async function completeJson<T>(
  workspaceId: string,
  caller: AgentAiCaller,
  request: LlmCompletionRequest,
  schema: z.ZodType<T>,
): Promise<LlmResult<{ value: T; model: string }>> {
  const result = await llmService.complete(workspaceId, caller, {
    ...request,
    responseFormat: "json",
  });
  if (!result.ok) return result;

  const parsed = parseJsonAnswer(result.data.text, schema);
  if (!parsed.ok) return parsed;

  return { ok: true, data: { value: parsed.data, model: result.data.model } };
}

export async function draftAgentText(
  workspaceId: string,
  caller: AgentAiCaller,
  input: AgentDraftInput,
): Promise<LlmResult<AgentDraftDto>> {
  const context = buildDraftContext(input);
  const maxChars = FIELD_MAX_CHARS[context.kind][context.field];

  const result = await completeJson(
    workspaceId,
    caller,
    {
      system: buildDraftSystemPrompt(context, input.language),
      prompt: buildDraftPrompt(context),
      maxTokens:
        context.field === "description"
          ? DESCRIPTION_MAX_TOKENS
          : INSTRUCTIONS_MAX_TOKENS[context.kind],
      mockAnswer: buildDraftMockAnswer(context),
    },
    agentDraftAnswerSchema(maxChars),
  );
  if (!result.ok) return result;

  // The trim is load-bearing, not cosmetic: agent-dialog.tsx has no error slot
  // for `description`, so an over-long draft that reached the save call would
  // fail with nothing visible to the operator.
  const { text, trimmed } = trimToLimit(result.data.value.text, maxChars);

  return {
    ok: true,
    data: { text, model: result.data.model, trimmed },
  };
}
