import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import {
  isValidTimeZone,
  MIN_INTERVAL_SECONDS,
  MINUTES_PER_DAY,
} from "@/lib/agents/schedule";

// Zod schemas — the single source of input validation for the AI Assistant
// section, shared by every /api/agents/** route handler. Limit constants live
// here so the schema and the service that re-checks them share one number.
//
// The run-time ceilings (AGENT_* in src/lib/config/env.ts) clamp these again
// when a run starts: this file says what an operator may store, the env says
// what a deployment will actually execute.

const M = VALIDATION_MESSAGES.agent;

export const AGENT_NAME_MAX = 80;
export const AGENT_DESCRIPTION_MAX = 280;
export const AGENT_INSTRUCTIONS_MAX = 8_000;
export const AGENT_MAX_STEPS_MAX = 24;
export const AGENT_MAX_TOKENS_MIN = 1_000;
export const AGENT_MAX_TOKENS_MAX = 200_000;
export const AGENT_TIMEOUT_SECONDS_MIN = 30;
export const AGENT_TIMEOUT_SECONDS_MAX = 1_800;
export const AGENT_MAX_SKILLS = 20;

export const SKILL_NAME_MAX = 80;
export const SKILL_DESCRIPTION_MAX = 200;
export const SKILL_INSTRUCTIONS_MAX = 4_000;
export const SKILL_MAX_TOOL_NAMES = 40;

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.nameRequired })
  .max(AGENT_NAME_MAX, { error: () => M.nameTooLong });

const descriptionSchema = z
  .string()
  .trim()
  .max(AGENT_DESCRIPTION_MAX, { error: () => M.descriptionTooLong });

const instructionsSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.instructionsRequired })
  .max(AGENT_INSTRUCTIONS_MAX, { error: () => M.instructionsTooLong });

// An unknown scope is rejected rather than dropped: silently storing an agent
// with fewer permissions than the operator ticked would be a worse surprise
// than a 400.
const scopesSchema = z
  .array(z.enum(MCP_SCOPES), { error: () => M.scopeInvalid })
  .max(MCP_SCOPES.length)
  .refine((values) => new Set(values).size === values.length, {
    error: () => M.scopeDuplicated,
  });

const maxStepsSchema = z
  .number()
  .int()
  .min(1, { error: () => M.maxStepsRange })
  .max(AGENT_MAX_STEPS_MAX, { error: () => M.maxStepsRange });

const maxTokensSchema = z
  .number()
  .int()
  .min(AGENT_MAX_TOKENS_MIN, { error: () => M.maxTokensRange })
  .max(AGENT_MAX_TOKENS_MAX, { error: () => M.maxTokensRange });

const timeoutSecondsSchema = z
  .number()
  .int()
  .min(AGENT_TIMEOUT_SECONDS_MIN, { error: () => M.timeoutRange })
  .max(AGENT_TIMEOUT_SECONDS_MAX, { error: () => M.timeoutRange });

export const agentCreateSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.optional(),
    instructions: instructionsSchema,
    scopes: scopesSchema.optional(),
    maxSteps: maxStepsSchema.optional(),
    maxTokens: maxTokensSchema.optional(),
    timeoutSeconds: timeoutSecondsSchema.optional(),
    reportOnCompletion: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const agentUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    instructions: instructionsSchema.optional(),
    scopes: scopesSchema.optional(),
    maxSteps: maxStepsSchema.optional(),
    maxTokens: maxTokensSchema.optional(),
    timeoutSeconds: timeoutSecondsSchema.optional(),
    reportOnCompletion: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateFieldsRequired,
  });

const skillDescriptionSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.skillDescriptionRequired })
  .max(SKILL_DESCRIPTION_MAX, { error: () => M.skillDescriptionTooLong });

const skillInstructionsSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.instructionsRequired })
  .max(SKILL_INSTRUCTIONS_MAX, { error: () => M.skillInstructionsTooLong });

// Shape only. Whether the name exists in the tool catalogue is checked in the
// service, which can reach src/lib/mcp without dragging the whole tool
// catalogue (and every service behind it) into a validation module.
const toolNamesSchema = z
  .array(
    z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]*$/, { error: () => M.toolNameInvalid }),
  )
  .max(SKILL_MAX_TOOL_NAMES, { error: () => M.toolNamesTooMany })
  .refine((values) => new Set(values).size === values.length, {
    error: () => M.toolNameDuplicated,
  });

export const skillCreateSchema = z
  .object({
    name: nameSchema,
    description: skillDescriptionSchema,
    instructions: skillInstructionsSchema,
    toolNames: toolNamesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const skillUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    description: skillDescriptionSchema.optional(),
    instructions: skillInstructionsSchema.optional(),
    toolNames: toolNamesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateFieldsRequired,
  });

// The whole attachment set is replaced at once, and the array order IS the
// injection order — a separate "reorder" endpoint would let the two drift.
export const agentSkillsSetSchema = z
  .object({
    skillIds: z
      .array(z.string().min(1, { error: () => M.skillIdInvalid }))
      .max(AGENT_MAX_SKILLS, { error: () => M.skillsTooMany })
      .refine((values) => new Set(values).size === values.length, {
        error: () => M.skillDuplicated,
      }),
  })
  .strict();

export const AGENT_RUN_TASK_MAX = 2_000;

// --- Schedules ---
//
// The three kinds each need exactly the fields they read, which the migration
// also enforces with a CHECK: a row that reaches computeNextRunAt() without
// them would have no answerable next occurrence.
const scheduleNameSchema = z
  .string()
  .trim()
  .min(1, { error: () => M.nameRequired })
  .max(AGENT_NAME_MAX, { error: () => M.nameTooLong });

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isValidTimeZone(value), {
    error: () => M.timeZoneInvalid,
  });

const scheduleShape = {
  name: scheduleNameSchema,
  kind: z.enum(["INTERVAL", "DAILY", "WEEKLY"]),
  intervalSeconds: z
    .number()
    .int()
    .min(MIN_INTERVAL_SECONDS, { error: () => M.intervalTooShort })
    .max(30 * 24 * 3_600)
    .nullable()
    .optional(),
  minuteOfDay: z
    .number()
    .int()
    .min(0, { error: () => M.minuteOfDayRange })
    .max(MINUTES_PER_DAY - 1, { error: () => M.minuteOfDayRange })
    .nullable()
    .optional(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .refine((values) => new Set(values).size === values.length, {
      error: () => M.daysOfWeekInvalid,
    })
    .optional(),
  timeZone: timeZoneSchema,
  input: z.string().trim().max(AGENT_RUN_TASK_MAX).nullable().optional(),
  isActive: z.boolean().optional(),
};

function requireKindFields(input: {
  kind?: "INTERVAL" | "DAILY" | "WEEKLY";
  intervalSeconds?: number | null;
  minuteOfDay?: number | null;
  daysOfWeek?: number[];
}): boolean {
  if (input.kind === "INTERVAL") return input.intervalSeconds != null;
  if (input.kind === "DAILY") return input.minuteOfDay != null;
  if (input.kind === "WEEKLY") {
    return input.minuteOfDay != null && (input.daysOfWeek?.length ?? 0) > 0;
  }
  return true;
}

export const agentScheduleCreateSchema = z
  .object(scheduleShape)
  .strict()
  .refine(requireKindFields, { error: () => M.scheduleFieldsRequired });

export const agentScheduleUpdateSchema = z
  .object({
    ...scheduleShape,
    name: scheduleNameSchema.optional(),
    kind: scheduleShape.kind.optional(),
    timeZone: timeZoneSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    error: () => M.updateFieldsRequired,
  })
  .refine(requireKindFields, { error: () => M.scheduleFieldsRequired });

// The task text of a single run. Optional: an agent whose instructions already
// say what to do every time does not need one.
export const agentRunCreateSchema = z
  .object({
    task: z
      .string()
      .trim()
      .max(AGENT_RUN_TASK_MAX, { error: () => M.taskTooLong })
      .optional(),
  })
  .strict();

export const agentRunListQuerySchema = z
  .object({
    agentId: z.string().trim().min(1).optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export type AgentCreateInput = z.output<typeof agentCreateSchema>;
export type AgentScheduleCreateInput = z.output<
  typeof agentScheduleCreateSchema
>;
export type AgentScheduleUpdateInput = z.output<
  typeof agentScheduleUpdateSchema
>;
export type AgentUpdateInput = z.output<typeof agentUpdateSchema>;
export type SkillCreateInput = z.output<typeof skillCreateSchema>;
export type SkillUpdateInput = z.output<typeof skillUpdateSchema>;
export type AgentSkillsSetInput = z.output<typeof agentSkillsSetSchema>;
