import type { z } from "zod";
import type { LlmCompletionRequest, LlmResult } from "@/lib/llm/contract";
import { parseJsonAnswer } from "@/lib/llm/json";
import * as llmService from "@/lib/services/llm";
import * as mailService from "@/lib/services/mail";
import { MailItemNotFoundError } from "@/lib/services/mail-actions";
import type { MailFilterMatchMode } from "@/lib/mail-filter-types";
import type { MailFilterConditionInput } from "@/lib/mail-filter-types";
import {
  buildFilterProposalMockAnswer,
  buildFilterProposalPrompt,
  buildFilterProposalSystemPrompt,
  buildMailAiContext,
  buildReplyDraftMockAnswer,
  buildReplyDraftPrompt,
  buildReplyDraftSystemPrompt,
  buildSummaryMockAnswer,
  buildSummaryPrompt,
  buildSummarySystemPrompt,
  type MailAiContext,
} from "@/lib/mail/ai-prompts";
import {
  mailFilterProposalAnswerSchema,
  mailReplyDraftAnswerSchema,
  mailSummaryAnswerSchema,
  sanitizeProposedConditions,
  type DraftMailReplyInput,
  type MailAiLanguage,
  type ProposeMailFilterRuleInput,
  type SummarizeMailInput,
} from "@/lib/validation/mail-ai";

// The three AI features of the Mail section (specs/ai-integration.md scenarios
// 1-3). One file rather than three because all three are the same pipeline —
// read the message, build the prompt, call the model, validate the answer —
// and splitting them would triple the LlmResult handling.
//
// This service writes NOTHING. It does not import mail-drafts.ts or
// mail-filter-rules.ts: the model proposes, the operator confirms, and the
// existing deterministic code persists. Everything here is request-scoped;
// a single model call per message does not need the MailFilterActionJob
// pattern (architecture.md §7F.3).

// Token ceilings per scenario. A summary and a proposal are short by
// construction; a reply is the only one that legitimately runs long.
const SUMMARY_MAX_TOKENS = 512;
const REPLY_MAX_TOKENS = 1024;
const PROPOSAL_MAX_TOKENS = 512;

export interface MailAiCaller {
  operatorId: string;
  operatorName: string;
}

interface MailAiMeta {
  // The model that actually answered, as the endpoint reported it. The driver
  // mode is deliberately NOT exposed: LlmCompletion does not carry it, and
  // every call here passes a mockAnswer, so it cannot be inferred from the
  // request either. The audit trail already records the mode.
  model: string;
  truncated: boolean;
}

export interface MailSummaryDto extends MailAiMeta {
  summary: string;
  bullets: string[];
  actionItems: string[];
}

export interface MailReplyDraftDto extends MailAiMeta {
  bodyText: string;
}

export interface MailFilterRuleProposalDto extends MailAiMeta {
  name: string;
  matchMode: MailFilterMatchMode;
  conditions: MailFilterConditionInput[];
  droppedConditions: number;
  reason: string | null;
}

// A missing message is not an outcome of a model call, so it throws the same
// error the other mail routes already map to 404 rather than becoming an
// LlmResult the caller would have to disambiguate.
async function loadContext(
  workspaceId: string,
  id: string,
): Promise<MailAiContext> {
  const item = await mailService.getById(id, workspaceId);
  if (!item) throw new MailItemNotFoundError(id);
  return buildMailAiContext(mailService.toMailDetailDto(item));
}

// The single place where all four JSON defences meet: the transport hint, the
// prompt contract (built by ai-prompts.ts), defensive extraction, and zod.
async function completeJson<T>(
  workspaceId: string,
  caller: MailAiCaller,
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

export async function summarizeMailMessage(
  workspaceId: string,
  id: string,
  caller: MailAiCaller,
  input: SummarizeMailInput,
): Promise<LlmResult<MailSummaryDto>> {
  const context = await loadContext(workspaceId, id);
  const result = await completeJson(
    workspaceId,
    caller,
    {
      system: buildSummarySystemPrompt(input.language),
      prompt: buildSummaryPrompt(context),
      maxTokens: SUMMARY_MAX_TOKENS,
      mockAnswer: buildSummaryMockAnswer(context),
    },
    mailSummaryAnswerSchema,
  );
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      summary: result.data.value.summary,
      bullets: result.data.value.bullets,
      actionItems: result.data.value.actionItems,
      model: result.data.model,
      truncated: context.truncated,
    },
  };
}

export async function draftMailReply(
  workspaceId: string,
  id: string,
  caller: MailAiCaller,
  input: DraftMailReplyInput,
): Promise<LlmResult<MailReplyDraftDto>> {
  const context = await loadContext(workspaceId, id);
  const result = await completeJson(
    workspaceId,
    caller,
    {
      system: buildReplyDraftSystemPrompt(input.language),
      prompt: buildReplyDraftPrompt(context, input.instruction),
      maxTokens: REPLY_MAX_TOKENS,
      mockAnswer: buildReplyDraftMockAnswer(context),
    },
    mailReplyDraftAnswerSchema,
  );
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      bodyText: result.data.value.bodyText,
      model: result.data.model,
      truncated: context.truncated,
    },
  };
}

export async function proposeMailFilterRule(
  workspaceId: string,
  id: string,
  caller: MailAiCaller,
  input: ProposeMailFilterRuleInput,
): Promise<LlmResult<MailFilterRuleProposalDto>> {
  const context = await loadContext(workspaceId, id);
  const result = await completeJson(
    workspaceId,
    caller,
    {
      system: buildFilterProposalSystemPrompt(input.language),
      prompt: buildFilterProposalPrompt(context),
      maxTokens: PROPOSAL_MAX_TOKENS,
      mockAnswer: buildFilterProposalMockAnswer(context),
    },
    mailFilterProposalAnswerSchema,
  );
  if (!result.ok) return result;

  // Every proposed condition is re-checked against the schema that validates
  // an operator's own input, so a bad field/operator pair costs that one
  // condition rather than the whole answer.
  const { conditions, dropped } = sanitizeProposedConditions(
    result.data.value.conditions,
  );
  if (conditions.length === 0) {
    return {
      ok: false,
      kind: "error",
      category: "invalid_response",
      message: `Model proposed ${dropped} conditions, none of them valid`,
    };
  }

  return {
    ok: true,
    data: {
      name: result.data.value.name,
      matchMode: result.data.value.matchMode,
      conditions,
      droppedConditions: dropped,
      reason: result.data.value.reason ?? null,
      model: result.data.model,
      truncated: context.truncated,
    },
  };
}

export type { MailAiLanguage };
