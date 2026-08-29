"use client";

// Shared plumbing for the management landing and the AI-brief automation
// page: defensive payload parsers, the workspace-scoped fetch helper, and
// the load-error alert. The landing consumes the snapshot; the automation
// page consumes setup + briefs.

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export type LoadState<T> =
  { state: "loading" } | { state: "ready"; value: T } | { state: "error" };

export function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}
export function stringField(value: unknown, name: string): string | undefined {
  const result = field(value, name);
  return typeof result === "string" && result.trim() ? result : undefined;
}
export function numberField(value: unknown, name: string): number | undefined {
  const result = field(value, name);
  return typeof result === "number" && Number.isFinite(result)
    ? result
    : undefined;
}
export function objectField(
  value: unknown,
  name: string,
): Record<string, unknown> | undefined {
  const result = field(value, name);
  return typeof result === "object" && result !== null && !Array.isArray(result)
    ? Object.fromEntries(Object.entries(result))
    : undefined;
}

export async function requestJson(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: {
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`Management request failed: ${response.status}`);
  return response.json();
}

export function LoadError({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Alert variant="warning">
      <Icon name="ri-error-warning-line" aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

export function evidenceHref(reference: string): string | null {
  const separator = reference.indexOf(":");
  if (separator < 1) return null;
  const type = reference.slice(0, separator);
  const id = reference.slice(separator + 1);
  const routes: Record<string, string> = {
    alert: `/alerts?alert=${id}`,
    service: `/services/${id}`,
    kanban: `/kanban?card=${id}`,
    reminder: `/calendar?reminder=${id}`,
    calendar: "/calendar",
    mail: `/mail?item=${id}`,
    message: "/messages",
    log: "/logs",
    decision: `/management?decision=${id}`,
    activity: "/activity",
  };
  return routes[type] ?? null;
}

// --- Snapshot (landing) ---

export interface SnapshotSummary {
  totals: Array<{ key: string; value: number }>;
  truncated: boolean;
  headline?: string;
  summary?: string;
}

export function parseSnapshot(payload: unknown): SnapshotSummary | null {
  const brief = field(payload, "latestBrief") ?? field(payload, "brief");
  const textSource =
    typeof brief === "object" && brief !== null ? brief : payload;
  const rawTotals = field(payload, "totals");
  const totals =
    typeof rawTotals === "object" && rawTotals !== null
      ? Object.keys(rawTotals)
          .sort()
          .flatMap((key) => {
            const value = numberField(rawTotals, key);
            return value === undefined ? [] : [{ key, value }];
          })
      : [];
  const truncation = field(payload, "truncation");
  const headline = stringField(textSource, "headline");
  const summary = stringField(textSource, "summary");
  if (totals.length === 0 && !headline && !summary) return null;
  return {
    totals,
    truncated: Array.isArray(truncation) && truncation.length > 0,
    headline,
    summary,
  };
}

// --- AI setup + briefs (automation page) ---

export interface SetupSummary {
  status: "MISSING" | "EDITED" | "READY";
  missing: string[];
  edited: string[];
  providerConfigured: boolean;
  agentId?: string;
  parts: {
    agent: SetupAgentSummary | null;
    skill: SetupSkillSummary | null;
    daily: SetupScheduleSummary | null;
    weekly: SetupScheduleSummary | null;
  };
}
export interface SetupAgentSummary {
  id: string;
  name: string;
  isActive: boolean;
}
export interface SetupSkillSummary {
  id: string;
  name: string;
  isActive: boolean;
  toolNames: string[];
}
export interface SetupScheduleSummary {
  id: string;
  name: string;
  isActive: boolean;
  minuteOfDay?: number;
  timeZone: string;
  nextRunAt?: string;
}
export interface BriefSummary {
  id: string;
  headline: string;
  summary?: string;
  publishedAt?: string;
}
export interface BriefDetail extends BriefSummary {
  highlights: BriefItem[];
  risks: BriefItem[];
  opportunities: BriefItem[];
}
export interface BriefItem {
  title: string;
  detail: string;
  evidenceRefs: string[];
}

export function parseBriefs(payload: unknown): BriefSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    const id = stringField(entry, "id");
    const headline = stringField(entry, "headline");
    if (!id || !headline) return [];
    return [
      {
        id,
        headline,
        summary: stringField(entry, "summary"),
        publishedAt: stringField(entry, "publishedAt"),
      },
    ];
  });
}

export function parseBriefDetail(payload: unknown): BriefDetail | null {
  const brief = parseBriefs([payload])[0];
  if (!brief) return null;
  const items = (name: string): BriefItem[] => {
    const value = field(payload, name);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      const title = stringField(entry, "title");
      const detail = stringField(entry, "detail");
      const evidenceRefs = field(entry, "evidenceRefs");
      if (!title || !detail) return [];
      return [
        {
          title,
          detail,
          evidenceRefs: Array.isArray(evidenceRefs)
            ? evidenceRefs.filter(
                (reference): reference is string =>
                  typeof reference === "string" && Boolean(reference.trim()),
              )
            : [],
        },
      ];
    });
  };
  return {
    ...brief,
    highlights: items("highlights"),
    risks: items("risks"),
    opportunities: items("opportunities"),
  };
}

export function parseSetup(payload: unknown): SetupSummary | null {
  const status = stringField(payload, "status");
  if (status !== "MISSING" && status !== "EDITED" && status !== "READY") {
    return null;
  }
  const missing = field(payload, "missing");
  const edited = field(payload, "edited");
  const parts = objectField(payload, "parts");
  const agent = objectField(parts, "agent");
  const skill = objectField(parts, "skill");
  const daily = objectField(parts, "daily");
  const weekly = objectField(parts, "weekly");
  const parseStringArray = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  const parseAgent = (
    value: Record<string, unknown> | undefined,
  ): SetupAgentSummary | null => {
    const id = stringField(value, "id");
    const name = stringField(value, "name");
    if (!id || !name) return null;
    return { id, name, isActive: field(value, "isActive") === true };
  };
  const parseSkill = (
    value: Record<string, unknown> | undefined,
  ): SetupSkillSummary | null => {
    const id = stringField(value, "id");
    const name = stringField(value, "name");
    if (!id || !name) return null;
    return {
      id,
      name,
      isActive: field(value, "isActive") === true,
      toolNames: parseStringArray(field(value, "toolNames")),
    };
  };
  const parseSchedule = (
    value: Record<string, unknown> | undefined,
  ): SetupScheduleSummary | null => {
    const id = stringField(value, "id");
    const name = stringField(value, "name");
    const timeZone = stringField(value, "timeZone");
    if (!id || !name || !timeZone) return null;
    return {
      id,
      name,
      isActive: field(value, "isActive") === true,
      minuteOfDay: numberField(value, "minuteOfDay"),
      timeZone,
      nextRunAt: stringField(value, "nextRunAt"),
    };
  };
  return {
    status,
    missing: parseStringArray(missing),
    edited: parseStringArray(edited),
    providerConfigured: field(payload, "providerConfigured") === true,
    agentId: stringField(payload, "agentId"),
    parts: {
      agent: parseAgent(agent),
      skill: parseSkill(skill),
      daily: parseSchedule(daily),
      weekly: parseSchedule(weekly),
    },
  };
}

export type AutomationPartStatus = "MISSING" | "EDITED" | "READY";

export function automationPartStatus(
  setup: SetupSummary,
  keys: readonly string[],
): AutomationPartStatus {
  if (keys.some((key) => setup.missing.includes(key))) return "MISSING";
  if (keys.some((key) => setup.edited.includes(key))) return "EDITED";
  return "READY";
}

export function scheduleTime(
  schedule: SetupScheduleSummary | null,
): string | null {
  if (!schedule || schedule.minuteOfDay === undefined) return null;
  const hours = String(Math.floor(schedule.minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(schedule.minuteOfDay % 60).padStart(2, "0");
  return `${hours}:${minutes} ${schedule.timeZone}`;
}
