// Thin fetch wrapper for the /api/agents/** routes,
// mirroring src/components/notes/api.ts. Mutations re-fetch the page's server
// component tree via `router.refresh()` from the calling component — this
// module keeps no client-side copy of anything.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import type { AgentDetail, AgentSummary } from "@/lib/services/agents";
import type {
  AgentRunDetail,
  AgentRunSummary,
} from "@/lib/services/agent-runs";
import type { AgentScheduleSummary } from "@/lib/services/agent-schedules";
import type { SkillDetail, SkillSummary } from "@/lib/services/skills";
import type { McpScope } from "@/lib/mcp/scopes";

export class ApiError extends Error {
  fieldErrors?: Record<string, string>;
  /** Machine-readable code ("AGENT_NAME_CONFLICT", "RESOURCE_NOT_FOUND"…). */
  code?: string;
  /** Only set alongside code === "SKILL_TOOL_UNKNOWN". */
  unknownTools?: string[];

  constructor(
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      code?: string;
      unknownTools?: string[];
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = options?.fieldErrors;
    this.code = options?.code;
    this.unknownTools = options?.unknownTools;
  }
}

interface ZodIssueLike {
  path?: Array<string | number>;
  message: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    let fieldErrors: Record<string, string> | undefined;
    let code: string | undefined;
    let unknownTools: string[] | undefined;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") {
        message = body.message ?? body.error;
        code = body.error;
        if (Array.isArray(body?.unknownTools)) {
          unknownTools = body.unknownTools as string[];
        }
      } else if (Array.isArray(body?.error)) {
        fieldErrors = {};
        for (const issue of body.error as ZodIssueLike[]) {
          const key = issue.path?.[0];
          if (typeof key === "string" && !fieldErrors[key]) {
            fieldErrors[key] = issue.message;
          }
        }
        message = (body.error as ZodIssueLike[])[0]?.message ?? message;
      }
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new ApiError(message, { fieldErrors, code, unknownTools });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AgentInput {
  name: string;
  description?: string;
  instructions: string;
  scopes?: McpScope[];
  maxSteps?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  reportOnCompletion?: boolean;
  isActive?: boolean;
}

export interface SkillInput {
  name: string;
  description: string;
  instructions: string;
  toolNames?: string[];
  isActive?: boolean;
}

export const agentsApi = {
  list: () => request<AgentSummary[]>("/api/agents"),
  get: (id: string) => request<AgentDetail>(`/api/agents/${id}`),
  create: (input: AgentInput) =>
    request<AgentDetail>("/api/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<AgentInput>) =>
    request<AgentDetail>(`/api/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/api/agents/${id}`, { method: "DELETE" }),
  // The array order is the injection order of the skill bodies.
  setSkills: (id: string, skillIds: string[]) =>
    request<AgentDetail>(`/api/agents/${id}/skills`, {
      method: "PUT",
      body: JSON.stringify({ skillIds }),
    }),
  // Queues a run; the scheduler executes it. The answer is the PENDING row.
  run: (id: string, task?: string) =>
    request<AgentRunSummary>(`/api/agents/${id}/run`, {
      method: "POST",
      body: JSON.stringify(task ? { task } : {}),
    }),
};

export interface AgentRunListResult {
  items: AgentRunSummary[];
  nextCursor: string | null;
}

export interface ScheduleInput {
  name: string;
  kind: "INTERVAL" | "DAILY" | "WEEKLY";
  intervalSeconds?: number | null;
  minuteOfDay?: number | null;
  daysOfWeek?: number[];
  timeZone: string;
  input?: string | null;
  isActive?: boolean;
}

export const agentSchedulesApi = {
  list: (agentId: string) =>
    request<AgentScheduleSummary[]>(`/api/agents/${agentId}/schedules`),
  create: (agentId: string, input: ScheduleInput) =>
    request<AgentScheduleSummary>(`/api/agents/${agentId}/schedules`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    agentId: string,
    scheduleId: string,
    input: Partial<ScheduleInput>,
  ) =>
    request<AgentScheduleSummary>(
      `/api/agents/${agentId}/schedules/${scheduleId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  remove: (agentId: string, scheduleId: string) =>
    request<void>(`/api/agents/${agentId}/schedules/${scheduleId}`, {
      method: "DELETE",
    }),
};

export const agentRunsApi = {
  list: (params: { agentId?: string; cursor?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.agentId) search.set("agentId", params.agentId);
    if (params.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return request<AgentRunListResult>(`/api/agents/runs${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => request<AgentRunDetail>(`/api/agents/runs/${id}`),
  cancel: (id: string) =>
    request<AgentRunDetail>(`/api/agents/runs/${id}/cancel`, {
      method: "POST",
    }),
};

// --- authoring assistant (architecture.md §7F.7) ---
//
// POST even though nothing is mutated, for the same reason the mail AI calls
// are: not idempotent, costs tokens, and a GET is something the browser is
// entitled to prefetch. The AbortSignal matters here too — the model deadline
// is 60 s, so an operator who closes the dialog must be able to drop the
// request. `request()` above already forwards `init.signal`.
//
// Failures arrive as a stable code in ApiError.code (AI_UNAVAILABLE,
// AI_RATE_LIMIT, …), which use-ai-draft.ts maps to a message key.

export interface AgentDraftRequest {
  kind: "AGENT" | "SKILL";
  field: "description" | "instructions";
  language: string;
  name: string;
  description?: string;
  instructions?: string;
}

export interface AgentDraftDto {
  text: string;
  model: string;
  trimmed: boolean;
}

export function draftAgentText(
  input: AgentDraftRequest,
  signal?: AbortSignal,
): Promise<AgentDraftDto> {
  return request<AgentDraftDto>("/api/agents/ai/draft", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export const skillsApi = {
  list: () => request<SkillSummary[]>("/api/agents/skills"),
  get: (id: string) => request<SkillDetail>(`/api/agents/skills/${id}`),
  create: (input: SkillInput) =>
    request<SkillDetail>("/api/agents/skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<SkillInput>) =>
    request<SkillDetail>(`/api/agents/skills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/api/agents/skills/${id}`, { method: "DELETE" }),
};
