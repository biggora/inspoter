import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import {
  AGENT_DESCRIPTION_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
} from "@/lib/validation/agents";

// Both sides of the authoring assistant: what the dialog sends while an
// operator is still writing an agent or a skill, and what the model sends
// back. Same rule as src/lib/validation/mail-ai.ts — the model's answer is
// untrusted input too, and zod is the single source of truth for both.
//
// The request schema is .strict(): an unexpected field from our own dialog is
// a bug worth surfacing. The answer schema is .strip(): an extra field from a
// model is noise, and throwing away a paid-for answer over it would be worse
// than ignoring it.

const M = VALIDATION_MESSAGES.agent;

export const AI_DRAFT_KINDS = ["AGENT", "SKILL"] as const;
export const AI_DRAFT_FIELDS = ["description", "instructions"] as const;
export const AI_DRAFT_LANGUAGES = ["en", "ru"] as const;

export type AiDraftKind = (typeof AI_DRAFT_KINDS)[number];
export type AiDraftField = (typeof AI_DRAFT_FIELDS)[number];
export type AiDraftLanguage = (typeof AI_DRAFT_LANGUAGES)[number];

// --- request input ---
//
// The brief is whatever the operator has typed so far. `description` and
// `instructions` are capped at the AGENT maxima rather than per kind: this is
// a prompt budget, not the field's own limit, and the per-kind cap belongs to
// the ANSWER instead. Both are optional because a brand-new dialog has
// neither — and because buildDraftContext(), not this schema, decides which
// of them actually reaches the model.
export const agentDraftRequestSchema = z
  .object({
    kind: z.enum(AI_DRAFT_KINDS),
    field: z.enum(AI_DRAFT_FIELDS),
    language: z.enum(AI_DRAFT_LANGUAGES),
    name: z
      .string()
      .trim()
      .min(1, { error: () => M.nameRequired })
      .max(AGENT_NAME_MAX, { error: () => M.nameTooLong }),
    description: z
      .string()
      .trim()
      .max(AGENT_DESCRIPTION_MAX, { error: () => M.descriptionTooLong })
      .default(""),
    instructions: z
      .string()
      .trim()
      .max(AGENT_INSTRUCTIONS_MAX, { error: () => M.instructionsTooLong })
      .default(""),
  })
  .strict();

export type AgentDraftInput = z.output<typeof agentDraftRequestSchema>;

// --- model answer ---

// Slack over the field's own character limit. A model that overshoots by a
// sentence is worth trimming — the service does that and reports it as
// `trimmed`. One that overshoots by half again ignored the budget the system
// prompt named, and its answer is worth rejecting rather than butchering.
export const ANSWER_SLACK = 1.5;

export function agentDraftAnswerSchema(fieldMaxChars: number) {
  return z
    .object({
      text: z
        .string()
        .trim()
        .min(1)
        .max(Math.ceil(fieldMaxChars * ANSWER_SLACK)),
    })
    .strip();
}

export type AgentDraftAnswer = z.output<
  ReturnType<typeof agentDraftAnswerSchema>
>;
