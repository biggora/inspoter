import { z } from "zod";
import {
  MAIL_FILTER_MATCH_MODES,
  MAX_MAIL_FILTER_CONDITIONS,
  type MailFilterConditionInput,
} from "@/lib/mail-filter-types";
import { mailFilterConditionSchema } from "@/lib/validation/mail";

// Both sides of the AI mail features live here: what the operator sends in,
// and what the model sends back. The model's answer is untrusted input too —
// zod stays the single source of truth for both, per specs/ai-integration.md.
//
// Request schemas are .strict(): an unexpected field from the operator is a
// bug worth surfacing. Answer schemas are .strip(): an extra field from a
// model is noise, and throwing away a paid-for answer over it would be worse
// than ignoring it.

export const MAIL_AI_LANGUAGES = ["en", "ru"] as const;
export type MailAiLanguage = (typeof MAIL_AI_LANGUAGES)[number];

export const mailAiLanguageSchema = z.enum(MAIL_AI_LANGUAGES);

// --- request input ---

export const summarizeMailSchema = z
  .object({ language: mailAiLanguageSchema })
  .strict();

export const draftMailReplySchema = z
  .object({
    language: mailAiLanguageSchema,
    instruction: z.string().trim().max(500).optional(),
  })
  .strict();

export const proposeMailFilterRuleSchema = z
  .object({ language: mailAiLanguageSchema })
  .strict();

export type SummarizeMailInput = z.infer<typeof summarizeMailSchema>;
export type DraftMailReplyInput = z.infer<typeof draftMailReplySchema>;
export type ProposeMailFilterRuleInput = z.infer<
  typeof proposeMailFilterRuleSchema
>;

// --- model answers ---

export const mailSummaryAnswerSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    bullets: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
    actionItems: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  })
  .strip();

export const mailReplyDraftAnswerSchema = z
  .object({
    // The model does not propose a subject: the composer already sets "Re: …",
    // and a model-rewritten subject would be a change the operator never
    // asked for.
    bodyText: z.string().trim().min(1).max(8000),
  })
  .strip();

export const mailFilterProposalAnswerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    matchMode: z.enum(MAIL_FILTER_MATCH_MODES).default("ALL"),
    // Conditions stay raw here and are checked one by one below: a single
    // bad field/operator pair must not void the whole answer.
    conditions: z.array(z.unknown()).min(1).max(50),
    reason: z.string().trim().max(500).optional(),
  })
  .strip();

export type MailSummaryAnswer = z.infer<typeof mailSummaryAnswerSchema>;
export type MailReplyDraftAnswer = z.infer<typeof mailReplyDraftAnswerSchema>;
export type MailFilterProposalAnswer = z.infer<
  typeof mailFilterProposalAnswerSchema
>;

export interface SanitizedProposedConditions {
  conditions: MailFilterConditionInput[];
  dropped: number;
}

function conditionKey(condition: MailFilterConditionInput): string {
  return [
    condition.field,
    condition.operator,
    condition.value.toLocaleLowerCase("en-US"),
    condition.isNegated,
  ].join("|");
}

// Runs each proposed condition through the very same schema that validates an
// operator's hand-typed one — NFKC normalization, the length cap, the
// OPERATORS_BY_FIELD table, and the true/false requirement on HAS_ATTACHMENT.
// A model that proposes FROM_DOMAIN + CONTAINS loses exactly that condition;
// the rest reach the form, and `dropped` is shown to the operator rather than
// swallowed. Silent discarding would be precisely the hidden model decision
// specs/ai-integration.md rules out.
export function sanitizeProposedConditions(
  raw: readonly unknown[],
): SanitizedProposedConditions {
  const conditions: MailFilterConditionInput[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const entry of raw) {
    const parsed = mailFilterConditionSchema.safeParse(entry);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }

    const key = conditionKey(parsed.data);
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }

    if (conditions.length >= MAX_MAIL_FILTER_CONDITIONS) {
      dropped += 1;
      continue;
    }

    seen.add(key);
    conditions.push(parsed.data);
  }

  return { conditions, dropped };
}
