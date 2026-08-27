"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";
import { Link } from "@/i18n/navigation";
import type { ManagementKanbanTarget } from "@/lib/services/management";

type LoadState<T> =
  { state: "loading" } | { state: "ready"; value: T } | { state: "error" };
interface SnapshotSummary {
  totals: Array<{ key: string; value: number }>;
  truncated: boolean;
  headline?: string;
  summary?: string;
}
interface DecisionSummary {
  id: string;
  title: string;
  version: number;
  priority?: string;
  status?: string;
  executionStatus?: string;
  actionType?: string;
  actionPayload?: unknown;
  evidenceRefs: string[];
  resultId?: string;
  resultHref?: string;
  resultLabel?: string;
  targetAvailability?: string;
  liveTargetId?: string;
  liveTargetHref?: string;
  lastExecutionError?: string;
}
interface DecisionEventSummary {
  id: string;
  sequence: number;
  type: string;
  actorName?: string;
  createdAt?: string;
  errorMessage?: string;
  fromStatus?: string;
  toStatus?: string;
  fromExecutionStatus?: string;
  toExecutionStatus?: string;
  actionRevision?: number;
  payloadHash?: string;
  receiptId?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
}
interface DecisionDetail extends DecisionSummary {
  context?: string;
  recommendation?: string;
  events: DecisionEventSummary[];
  brief?: BriefSummary;
}
interface SetupSummary {
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
interface SetupAgentSummary {
  id: string;
  name: string;
  isActive: boolean;
}
interface SetupSkillSummary {
  id: string;
  name: string;
  isActive: boolean;
  toolNames: string[];
}
interface SetupScheduleSummary {
  id: string;
  name: string;
  isActive: boolean;
  minuteOfDay?: number;
  timeZone: string;
  nextRunAt?: string;
}
interface BriefSummary {
  id: string;
  headline: string;
  summary?: string;
  publishedAt?: string;
}
interface BriefDetail extends BriefSummary {
  highlights: BriefItem[];
  risks: BriefItem[];
  opportunities: BriefItem[];
}
interface BriefItem {
  title: string;
  detail: string;
  evidenceRefs: string[];
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}
function stringField(value: unknown, name: string): string | undefined {
  const result = field(value, name);
  return typeof result === "string" && result.trim() ? result : undefined;
}
function numberField(value: unknown, name: string): number | undefined {
  const result = field(value, name);
  return typeof result === "number" && Number.isFinite(result)
    ? result
    : undefined;
}

function objectField(
  value: unknown,
  name: string,
): Record<string, unknown> | undefined {
  const result = field(value, name);
  return typeof result === "object" && result !== null && !Array.isArray(result)
    ? Object.fromEntries(Object.entries(result))
    : undefined;
}

interface KanbanTargetMatch {
  board: ManagementKanbanTarget;
  column: ManagementKanbanTarget["columns"][number];
}

function findKanbanTarget(
  targets: readonly ManagementKanbanTarget[],
  columnId: string | undefined,
): KanbanTargetMatch | null {
  if (!columnId) return null;
  for (const board of targets) {
    const column = board.columns.find((candidate) => candidate.id === columnId);
    if (column) return { board, column };
  }
  return null;
}

function findUniqueKanbanTargetByName(
  targets: readonly ManagementKanbanTarget[],
  columnName: string | undefined,
): KanbanTargetMatch | null {
  if (!columnName?.trim()) return null;
  const normalized = columnName.trim().toLocaleLowerCase();
  const matches = targets.flatMap((board) =>
    board.columns
      .filter((column) => column.name.toLocaleLowerCase() === normalized)
      .map((column) => ({ board, column })),
  );
  return matches.length === 1 ? matches[0] : null;
}

function parseActionEditor(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch {
    return null;
  }
}

function withKanbanColumnId(value: string, columnId: string): string {
  const action = parseActionEditor(value);
  if (!action) return value;
  const payload = objectField(action, "payload") ?? {};
  return JSON.stringify(
    { ...action, payload: { ...payload, columnId } },
    null,
    2,
  );
}

function prepareActionEditor(
  decision: DecisionSummary | null,
  targets: readonly ManagementKanbanTarget[],
): { json: string; boardId: string } {
  if (!decision?.actionType) return { json: "", boardId: "" };
  const action = {
    type: decision.actionType,
    payload: decision.actionPayload ?? {},
  };
  if (decision.actionType !== "CREATE_KANBAN_CARD") {
    return { json: JSON.stringify(action, null, 2), boardId: "" };
  }
  const columnId = stringField(decision.actionPayload, "columnId");
  const target =
    findKanbanTarget(targets, columnId) ??
    findUniqueKanbanTargetByName(targets, columnId);
  if (!target) return { json: JSON.stringify(action, null, 2), boardId: "" };
  return {
    json: JSON.stringify(
      {
        ...action,
        payload: {
          ...objectField(action, "payload"),
          columnId: target.column.id,
        },
      },
      null,
      2,
    ),
    boardId: target.board.id,
  };
}

function hasValidKanbanTarget(
  decision: Pick<DecisionSummary, "actionType" | "actionPayload">,
  targets: readonly ManagementKanbanTarget[],
): boolean {
  if (decision.actionType !== "CREATE_KANBAN_CARD") return true;
  return Boolean(
    findKanbanTarget(targets, stringField(decision.actionPayload, "columnId")),
  );
}

function decisionResultHref(
  decision: DecisionSummary,
  targets: readonly ManagementKanbanTarget[],
): string | undefined {
  const storedHref = decision.liveTargetHref ?? decision.resultHref;
  if (decision.actionType !== "CREATE_KANBAN_CARD") return storedHref;
  const target = findKanbanTarget(
    targets,
    stringField(decision.actionPayload, "columnId"),
  );
  const cardId = decision.liveTargetId ?? decision.resultId;
  return target && cardId
    ? `/kanban/${target.board.id}?card=${cardId}`
    : storedHref;
}

function parseSnapshot(payload: unknown): SnapshotSummary | null {
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
function parseDecisions(payload: unknown): DecisionSummary[] {
  const items = Array.isArray(payload)
    ? payload
    : (field(payload, "items") ?? field(payload, "decisions"));
  if (!Array.isArray(items)) return [];
  return items.flatMap((entry) => {
    const id = stringField(entry, "id");
    const title = stringField(entry, "title");
    const version = numberField(entry, "version") ?? 1;
    if (!id || !title) return [];
    const evidenceRefs = field(entry, "evidenceRefs");
    const receipts = field(entry, "receipts");
    const latestReceipt = Array.isArray(receipts) ? receipts[0] : undefined;
    return [
      {
        id,
        title,
        version,
        priority: stringField(entry, "priority"),
        status: stringField(entry, "status"),
        executionStatus: stringField(entry, "executionStatus"),
        actionType: stringField(entry, "actionType"),
        actionPayload: field(entry, "actionPayload"),
        evidenceRefs: Array.isArray(evidenceRefs)
          ? evidenceRefs.filter(
              (reference): reference is string => typeof reference === "string",
            )
          : [],
        resultId: stringField(entry, "resultId"),
        resultHref: stringField(entry, "resultHref"),
        resultLabel: stringField(entry, "resultLabel"),
        targetAvailability: stringField(latestReceipt, "targetAvailability"),
        liveTargetId: stringField(latestReceipt, "liveTargetId"),
        liveTargetHref: stringField(latestReceipt, "liveTargetHref"),
        lastExecutionError: stringField(entry, "lastExecutionError"),
      },
    ];
  });
}
function parseDecisionDetail(payload: unknown): DecisionDetail | null {
  const summary = parseDecisions([payload])[0];
  if (!summary) return null;
  const rawEvents = field(payload, "events");
  const events = Array.isArray(rawEvents)
    ? rawEvents.flatMap((entry) => {
        const id = stringField(entry, "id");
        const type = stringField(entry, "type");
        const sequence = numberField(entry, "sequence");
        if (!id || !type || sequence === undefined) return [];
        return [
          {
            id,
            type,
            sequence,
            actorName: stringField(entry, "actorName"),
            createdAt: stringField(entry, "createdAt"),
            errorMessage: stringField(entry, "errorMessage"),
            fromStatus: stringField(entry, "fromStatus"),
            toStatus: stringField(entry, "toStatus"),
            fromExecutionStatus: stringField(entry, "fromExecutionStatus"),
            toExecutionStatus: stringField(entry, "toExecutionStatus"),
            actionRevision: numberField(entry, "actionRevision"),
            payloadHash: stringField(entry, "payloadHash"),
            receiptId: stringField(entry, "receiptId"),
            targetType: stringField(entry, "targetType"),
            targetId: stringField(entry, "targetId"),
            targetLabel: stringField(entry, "targetLabel"),
          },
        ];
      })
    : [];
  const briefValue = field(payload, "brief");
  const brief = parseBriefs(briefValue ? [briefValue] : [])[0];
  return {
    ...summary,
    context: stringField(payload, "context"),
    recommendation: stringField(payload, "recommendation"),
    events,
    brief,
  };
}
function parseSetup(payload: unknown): SetupSummary | null {
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

type AutomationPartStatus = "MISSING" | "EDITED" | "READY";

function automationPartStatus(
  setup: SetupSummary,
  keys: readonly string[],
): AutomationPartStatus {
  if (keys.some((key) => setup.missing.includes(key))) return "MISSING";
  if (keys.some((key) => setup.edited.includes(key))) return "EDITED";
  return "READY";
}

function scheduleTime(schedule: SetupScheduleSummary | null): string | null {
  if (!schedule || schedule.minuteOfDay === undefined) return null;
  const hours = String(Math.floor(schedule.minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(schedule.minuteOfDay % 60).padStart(2, "0");
  return `${hours}:${minutes} ${schedule.timeZone}`;
}
function parseBriefs(payload: unknown): BriefSummary[] {
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
function parseBriefDetail(payload: unknown): BriefDetail | null {
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

function evidenceHref(reference: string): string | null {
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
function priorityKey(value?: string) {
  switch (value) {
    case "LOW":
      return "priorityLow";
    case "MEDIUM":
      return "priorityMedium";
    case "HIGH":
      return "priorityHigh";
    case "CRITICAL":
      return "priorityCritical";
    default:
      return "priorityUnknown";
  }
}
function statusKey(value?: string) {
  switch (value) {
    case "OPEN":
      return "statusOpen";
    case "DEFERRED":
      return "statusDeferred";
    case "APPROVED":
      return "statusApproved";
    case "REJECTED":
      return "statusRejected";
    default:
      return "statusUnknown";
  }
}
async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
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

function tomorrowIso(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

export function ManagementView({
  kanbanTargets,
}: {
  kanbanTargets: ManagementKanbanTarget[];
}) {
  const t = useTranslations("management");
  const format = useFormatter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [bucket, setBucket] = useState<"active" | "deferred" | "resolved">(
    "active",
  );
  const [snapshot, setSnapshot] = useState<LoadState<SnapshotSummary | null>>({
    state: "loading",
  });
  const [decisions, setDecisions] = useState<LoadState<DecisionSummary[]>>({
    state: "loading",
  });
  const [setup, setSetup] = useState<LoadState<SetupSummary | null>>({
    state: "loading",
  });
  const [briefs, setBriefs] = useState<LoadState<BriefSummary[]>>({
    state: "loading",
  });
  const [decisionDetail, setDecisionDetail] = useState<
    LoadState<DecisionDetail | null>
  >({ state: "ready", value: null });
  const [briefDetail, setBriefDetail] = useState<LoadState<BriefDetail | null>>(
    {
      state: "ready",
      value: null,
    },
  );
  const [actionJson, setActionJson] = useState("");
  const [kanbanBoardId, setKanbanBoardId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const titleId = useId();
  const contextId = useId();
  const priorityId = useId();

  const loadAi = useCallback(async () => {
    const [setupResult, briefsResult] = await Promise.allSettled([
      requestJson("/api/management/setup"),
      requestJson("/api/management/briefs"),
    ]);
    setSetup(
      setupResult.status === "fulfilled"
        ? { state: "ready", value: parseSetup(setupResult.value) }
        : { state: "error" },
    );
    setBriefs(
      briefsResult.status === "fulfilled"
        ? { state: "ready", value: parseBriefs(briefsResult.value) }
        : { state: "error" },
    );
  }, []);

  const load = useCallback(async () => {
    const [snapshotResult, decisionsResult] = await Promise.allSettled([
      requestJson(`/api/management/snapshot?period=${period}`),
      requestJson(`/api/management/decisions?bucket=${bucket}`),
    ]);
    setSnapshot(
      snapshotResult.status === "fulfilled"
        ? { state: "ready", value: parseSnapshot(snapshotResult.value) }
        : { state: "error" },
    );
    setDecisions(
      decisionsResult.status === "fulfilled"
        ? { state: "ready", value: parseDecisions(decisionsResult.value) }
        : { state: "error" },
    );
  }, [bucket, period]);
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      requestJson(`/api/management/snapshot?period=${period}`),
      requestJson(`/api/management/decisions?bucket=${bucket}`),
    ]).then(([snapshotResult, decisionsResult]) => {
      if (cancelled) return;
      setSnapshot(
        snapshotResult.status === "fulfilled"
          ? { state: "ready", value: parseSnapshot(snapshotResult.value) }
          : { state: "error" },
      );
      setDecisions(
        decisionsResult.status === "fulfilled"
          ? { state: "ready", value: parseDecisions(decisionsResult.value) }
          : { state: "error" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, period]);
  useEffect(() => {
    void Promise.resolve().then(loadAi);
  }, [loadAi]);
  useEffect(() => {
    const decisionId = searchParams.get("decision");
    if (!decisionId) return;
    let cancelled = false;
    void requestJson(`/api/management/decisions/${decisionId}`)
      .then((payload) => {
        if (cancelled) return;
        const value = parseDecisionDetail(payload);
        setDecisionDetail({ state: "ready", value });
        const editor = prepareActionEditor(value, kanbanTargets);
        setActionJson(editor.json);
        setKanbanBoardId(editor.boardId);
      })
      .catch(() => {
        if (!cancelled) setDecisionDetail({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [kanbanTargets, searchParams]);

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusyId("create");
    setMutationError(false);
    try {
      await requestJson("/api/management/decisions", {
        method: "POST",
        body: JSON.stringify({ title, context: context || null, priority }),
      });
      setTitle("");
      setContext("");
      await load();
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }
  async function mutate(
    decision: DecisionSummary,
    operation: "APPROVE" | "REJECT" | "DEFER" | "RETRY",
  ) {
    setBusyId(decision.id);
    setMutationError(false);
    const retry = operation === "RETRY";
    const body = retry
      ? { expectedVersion: decision.version }
      : operation === "DEFER"
        ? {
            transition: operation,
            expectedVersion: decision.version,
            deferredUntil: tomorrowIso(),
          }
        : { transition: operation, expectedVersion: decision.version };
    try {
      await requestJson(
        `/api/management/decisions/${decision.id}/${retry ? "retry" : "transition"}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      await Promise.all([
        load(),
        decisionDetail.state === "ready" &&
        decisionDetail.value?.id === decision.id
          ? showDecision(decision.id)
          : Promise.resolve(),
      ]);
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function showDecision(id: string) {
    setDecisionDetail({ state: "loading" });
    try {
      const value = parseDecisionDetail(
        await requestJson(`/api/management/decisions/${id}`),
      );
      setDecisionDetail({ state: "ready", value });
      const editor = prepareActionEditor(value, kanbanTargets);
      setActionJson(editor.json);
      setKanbanBoardId(editor.boardId);
    } catch {
      setDecisionDetail({ state: "error" });
    }
  }

  async function saveAction(rebind: boolean) {
    if (decisionDetail.state !== "ready" || !decisionDetail.value) return;
    setBusyId(decisionDetail.value.id);
    setMutationError(false);
    try {
      const action = JSON.parse(actionJson) as unknown;
      await requestJson(
        `/api/management/decisions/${decisionDetail.value.id}${rebind ? "/rebind" : ""}`,
        {
          method: rebind ? "POST" : "PATCH",
          body: JSON.stringify({
            expectedVersion: decisionDetail.value.version,
            action,
          }),
        },
      );
      await Promise.all([load(), showDecision(decisionDetail.value.id)]);
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function showBrief(id: string) {
    setBriefDetail({ state: "loading" });
    try {
      setBriefDetail({
        state: "ready",
        value: parseBriefDetail(
          await requestJson(`/api/management/briefs/${id}`),
        ),
      });
    } catch {
      setBriefDetail({ state: "error" });
    }
  }

  async function configureAi(repair: boolean) {
    setBusyId("setup");
    setMutationError(false);
    try {
      await requestJson(
        repair ? "/api/management/setup/repair" : "/api/management/setup",
        { method: "POST" },
      );
      await loadAi();
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function generateBrief() {
    setBusyId("generate");
    setMutationError(false);
    try {
      await requestJson("/api/management/briefs/generate", {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      await loadAi();
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }

  const editorAction = parseActionEditor(actionJson);
  const editorActionType = stringField(editorAction, "type");
  const editorPayload = objectField(editorAction, "payload");
  const editorColumnId = stringField(editorPayload, "columnId");
  const editorKanbanTarget = findKanbanTarget(kanbanTargets, editorColumnId);
  const selectedKanbanBoardId = editorKanbanTarget?.board.id ?? kanbanBoardId;
  const selectedKanbanBoard =
    kanbanTargets.find((board) => board.id === selectedKanbanBoardId) ?? null;
  const editorNeedsKanbanTarget = editorActionType === "CREATE_KANBAN_CARD";
  const editorHasValidKanbanTarget =
    !editorNeedsKanbanTarget || editorKanbanTarget !== null;
  const setupValue = setup.state === "ready" ? setup.value : null;
  const scheduleDescription = (schedule: SetupScheduleSummary | null) => {
    const time = scheduleTime(schedule);
    if (!schedule) return t("automationNotCreated");
    if (!schedule.nextRunAt) return time ?? t("automationScheduleUnavailable");
    const nextRunAt = new Date(schedule.nextRunAt);
    const nextRun = Number.isNaN(nextRunAt.getTime())
      ? null
      : format.dateTime(nextRunAt, {
          dateStyle: "medium",
          timeStyle: "short",
        });
    return [time, nextRun ? t("automationNextRun", { value: nextRun }) : null]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
  };
  const automationCards = setupValue
    ? [
        {
          key: "provider",
          icon: "ri-sparkling-2-line",
          title: t("automationProviderTitle"),
          name: setupValue.providerConfigured
            ? t("automationProviderConfigured")
            : t("automationProviderMissing"),
          description: setupValue.providerConfigured
            ? t("automationProviderReadyDescription")
            : t("automationProviderMissingDescription"),
          status: setupValue.providerConfigured
            ? ("READY" as const)
            : ("MISSING" as const),
          href: "/settings/providers",
          repair: false,
        },
        {
          key: "agent",
          icon: "ri-robot-2-line",
          title: t("automationAgentTitle"),
          name: setupValue.parts.agent?.name ?? t("automationNotCreated"),
          description: t("automationAgentDescription"),
          status: setupValue.parts.agent
            ? automationPartStatus(setupValue, ["agent"])
            : ("MISSING" as const),
          href: setupValue.agentId ? `/agents/${setupValue.agentId}` : null,
          repair: !setupValue.parts.agent,
        },
        {
          key: "skill",
          icon: "ri-lightbulb-line",
          title: t("automationSkillTitle"),
          name: setupValue.parts.skill?.name ?? t("automationNotCreated"),
          description: setupValue.parts.skill
            ? t("automationSkillTools", {
                count: setupValue.parts.skill.toolNames.length,
              })
            : t("automationSkillDescription"),
          status: setupValue.parts.skill
            ? automationPartStatus(setupValue, ["skill", "attachment"])
            : ("MISSING" as const),
          href: setupValue.parts.skill ? "/agents/skills" : null,
          repair:
            !setupValue.parts.skill ||
            setupValue.missing.includes("attachment"),
        },
        {
          key: "daily",
          icon: "ri-sun-line",
          title: t("automationDailyTitle"),
          name: setupValue.parts.daily?.name ?? t("automationNotCreated"),
          description: scheduleDescription(setupValue.parts.daily),
          status: setupValue.parts.daily
            ? automationPartStatus(setupValue, ["daily"])
            : ("MISSING" as const),
          href: setupValue.agentId
            ? `/agents/${setupValue.agentId}#schedules`
            : null,
          repair: !setupValue.parts.daily,
        },
        {
          key: "weekly",
          icon: "ri-calendar-2-line",
          title: t("automationWeeklyTitle"),
          name: setupValue.parts.weekly?.name ?? t("automationNotCreated"),
          description: scheduleDescription(setupValue.parts.weekly),
          status: setupValue.parts.weekly
            ? automationPartStatus(setupValue, ["weekly"])
            : ("MISSING" as const),
          href: setupValue.agentId
            ? `/agents/${setupValue.agentId}#schedules`
            : null,
          repair: !setupValue.parts.weekly,
        },
      ]
    : [];

  return (
    <PageBody>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      {mutationError ? (
        <LoadError
          title={t("conflictTitle")}
          description={t("conflictDescription")}
        />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t("snapshotTitle")}</CardTitle>
              <CardDescription>{t("snapshotDescription")}</CardDescription>
            </div>
            <NativeSelect
              value={period}
              aria-label={t("periodLabel")}
              onChange={(event) =>
                setPeriod(event.target.value === "WEEKLY" ? "WEEKLY" : "DAILY")
              }
            >
              <NativeSelectOption value="DAILY">
                {t("periodDaily")}
              </NativeSelectOption>
              <NativeSelectOption value="WEEKLY">
                {t("periodWeekly")}
              </NativeSelectOption>
            </NativeSelect>
          </CardHeader>
          <CardContent>
            {snapshot.state === "loading" ? (
              <Skeleton className="h-24 w-full" />
            ) : snapshot.state === "error" ? (
              <LoadError
                title={t("snapshotErrorTitle")}
                description={t("snapshotErrorDescription")}
              />
            ) : snapshot.value ? (
              <div className="space-y-3">
                {snapshot.value.headline ? (
                  <h2 className="font-heading text-base font-medium">
                    {snapshot.value.headline}
                  </h2>
                ) : null}
                {snapshot.value.summary ? (
                  <p className="text-sm text-muted-foreground">
                    {snapshot.value.summary}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {snapshot.value.totals.slice(0, 8).map((total) => (
                    <div key={total.key} className="rounded-lg border p-3">
                      <div className="text-2xl font-semibold tabular-nums">
                        {total.value}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {total.key}
                      </div>
                    </div>
                  ))}
                </div>
                {snapshot.value.truncated ? (
                  <Badge variant="outline">{t("snapshotTruncated")}</Badge>
                ) : null}
              </div>
            ) : (
              <EmptyState
                size="sm"
                icon="ri-file-chart-line"
                title={t("snapshotEmptyTitle")}
                description={t("snapshotEmptyDescription")}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("createTitle")}</CardTitle>
            <CardDescription>{t("createDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createDecision}>
              <Field>
                <FieldLabel htmlFor={titleId}>{t("fieldTitle")}</FieldLabel>
                <Input
                  id={titleId}
                  value={title}
                  maxLength={200}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={contextId}>{t("fieldContext")}</FieldLabel>
                <Textarea
                  id={contextId}
                  value={context}
                  maxLength={4000}
                  onChange={(event) => setContext(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={priorityId}>
                  {t("fieldPriority")}
                </FieldLabel>
                <NativeSelect
                  id={priorityId}
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <NativeSelectOption value="LOW">
                    {t("priorityLow")}
                  </NativeSelectOption>
                  <NativeSelectOption value="MEDIUM">
                    {t("priorityMedium")}
                  </NativeSelectOption>
                  <NativeSelectOption value="HIGH">
                    {t("priorityHigh")}
                  </NativeSelectOption>
                  <NativeSelectOption value="CRITICAL">
                    {t("priorityCritical")}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Button type="submit" disabled={busyId === "create"}>
                {busyId === "create" ? t("saving") : t("createAction")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("aiTitle")}</CardTitle>
          <CardDescription>{t("aiDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setup.state === "loading" || briefs.state === "loading" ? (
            <Skeleton className="h-20 w-full" />
          ) : setup.state === "error" || briefs.state === "error" ? (
            <LoadError
              title={t("aiUnavailableTitle")}
              description={t("aiUnavailableDescription")}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium">
                    {setup.value && !setup.value.providerConfigured
                      ? t("aiNoProvider")
                      : setup.value?.status === "READY"
                        ? t("aiReady")
                        : setup.value?.status === "EDITED"
                          ? t("aiEdited")
                          : t("aiMissing")}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("automationOverviewDescription")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={
                      busyId === "generate" ||
                      setup.value?.status !== "READY" ||
                      !setup.value.providerConfigured
                    }
                    onClick={() => void generateBrief()}
                  >
                    {busyId === "generate" ? t("generating") : t("generateNow")}
                  </Button>
                </div>
              </div>
              {setupValue ? (
                <div
                  className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
                  aria-label={t("automationComponentsLabel")}
                >
                  {automationCards.map((card) => (
                    <div
                      key={card.key}
                      className="flex min-h-48 flex-col rounded-lg border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon name={card.icon} className="text-lg" />
                        </span>
                        <Badge
                          variant={
                            card.status === "READY"
                              ? "success"
                              : card.status === "EDITED"
                                ? "warning"
                                : "error"
                          }
                        >
                          {card.status === "READY"
                            ? t("automationStatusReady")
                            : card.status === "EDITED"
                              ? t("automationStatusEdited")
                              : t("automationStatusMissing")}
                        </Badge>
                      </div>
                      <div className="mt-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {card.title}
                        </div>
                        <div className="mt-1 font-medium">{card.name}</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {card.description}
                        </p>
                      </div>
                      <div className="mt-auto pt-4">
                        {card.repair ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === "setup"}
                            onClick={() => void configureAi(true)}
                          >
                            <Icon
                              name="ri-tools-line"
                              aria-hidden
                              data-icon="inline-start"
                            />
                            {t("aiRepair")}
                          </Button>
                        ) : card.href ? (
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={card.href} />}
                            nativeButton={false}
                          >
                            <Icon
                              name="ri-settings-3-line"
                              aria-hidden
                              data-icon="inline-start"
                            />
                            {card.key === "provider"
                              ? t("automationConfigureProvider")
                              : t("automationOpenSettings")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {briefs.value.length ? (
                <ul className="space-y-2" aria-label={t("briefHistoryLabel")}>
                  {briefs.value.slice(0, 5).map((brief) => (
                    <li key={brief.id} className="rounded-lg border p-3">
                      <div className="font-medium">{brief.headline}</div>
                      {brief.summary ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {brief.summary}
                        </p>
                      ) : null}
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="outline"
                        onClick={() => void showBrief(brief.id)}
                      >
                        {t("viewDetails")}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("briefsEmpty")}
                </p>
              )}
              {briefDetail.state === "loading" ? (
                <Skeleton className="h-24 w-full" />
              ) : briefDetail.state === "error" ? (
                <LoadError
                  title={t("briefDetailErrorTitle")}
                  description={t("briefDetailErrorDescription")}
                />
              ) : briefDetail.value ? (
                <article className="space-y-5 rounded-lg border p-4">
                  <h3 className="font-medium">{briefDetail.value.headline}</h3>
                  {briefDetail.value.summary ? (
                    <p className="text-sm text-muted-foreground">
                      {briefDetail.value.summary}
                    </p>
                  ) : null}
                  {[
                    {
                      name: "highlights" as const,
                      icon: "ri-checkbox-circle-line",
                      items: briefDetail.value.highlights,
                    },
                    {
                      name: "risks" as const,
                      icon: "ri-error-warning-line",
                      items: briefDetail.value.risks,
                    },
                    {
                      name: "opportunities" as const,
                      icon: "ri-lightbulb-line",
                      items: briefDetail.value.opportunities,
                    },
                  ].map((section) => (
                    <section key={section.name}>
                      <div className="flex items-center gap-2">
                        <Icon
                          name={section.icon}
                          className="text-muted-foreground"
                        />
                        <h4 className="text-sm font-medium">
                          {t(section.name)}
                        </h4>
                        <Badge variant="outline">{section.items.length}</Badge>
                      </div>
                      {section.items.length ? (
                        <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                          {section.items.map((item, itemIndex) => (
                            <li
                              key={`${section.name}-${itemIndex}-${item.title}`}
                              className="rounded-lg border bg-card p-3"
                            >
                              <h5 className="font-medium">{item.title}</h5>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {item.detail}
                              </p>
                              {item.evidenceRefs.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.evidenceRefs.map(
                                    (reference, referenceIndex) => {
                                      const href = evidenceHref(reference);
                                      return href ? (
                                        <Button
                                          key={reference}
                                          size="xs"
                                          variant="outline"
                                          render={<Link href={href} />}
                                          nativeButton={false}
                                        >
                                          <Icon
                                            name="ri-links-line"
                                            aria-hidden
                                            data-icon="inline-start"
                                          />
                                          {t("briefSource", {
                                            number: referenceIndex + 1,
                                          })}
                                        </Button>
                                      ) : (
                                        <Badge
                                          key={reference}
                                          variant="outline"
                                        >
                                          {t("briefSourceUnavailable", {
                                            number: referenceIndex + 1,
                                          })}
                                        </Badge>
                                      );
                                    },
                                  )}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t("briefSectionEmpty")}
                        </p>
                      )}
                    </section>
                  ))}
                </article>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("decisionsTitle")}</CardTitle>
          <CardDescription>{t("decisionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex flex-wrap gap-2"
            aria-label={t("decisionBuckets")}
          >
            {(["active", "deferred", "resolved"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={bucket === value ? "default" : "outline"}
                onClick={() => setBucket(value)}
              >
                {t(`bucket${value[0].toUpperCase()}${value.slice(1)}`)}
              </Button>
            ))}
          </div>
          {decisions.state === "loading" ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : decisions.state === "error" ? (
            <LoadError
              title={t("decisionsErrorTitle")}
              description={t("decisionsErrorDescription")}
            />
          ) : decisions.value.length === 0 ? (
            <EmptyState
              size="sm"
              icon="ri-checkbox-circle-line"
              title={t("decisionsEmptyTitle")}
              description={t("decisionsEmptyDescription")}
            />
          ) : (
            <ul className="space-y-3" aria-label={t("decisionsListLabel")}>
              {decisions.value.map((decision) => {
                const targetValid = hasValidKanbanTarget(
                  decision,
                  kanbanTargets,
                );
                const resultHref = decisionResultHref(decision, kanbanTargets);
                return (
                  <li
                    key={decision.id}
                    className="space-y-3 rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{decision.title}</div>
                        {decision.actionType ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("actionPreview")}: {decision.actionType}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">
                          {t(priorityKey(decision.priority))}
                        </Badge>
                        <Badge variant="secondary">
                          {t(statusKey(decision.status))}
                        </Badge>
                        {decision.executionStatus ? (
                          <Badge variant="outline">
                            {decision.executionStatus}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {!targetValid ? (
                      <p className="text-sm text-destructive">
                        {t("kanbanTargetRequired")}
                      </p>
                    ) : decision.lastExecutionError ? (
                      <p className="text-sm text-destructive">
                        {decision.lastExecutionError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === decision.id}
                        onClick={() => void showDecision(decision.id)}
                      >
                        {t("viewDetails")}
                      </Button>
                      {decision.status === "OPEN" ||
                      decision.status === "DEFERRED" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busyId === decision.id || !targetValid}
                            onClick={() => void mutate(decision, "APPROVE")}
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === decision.id}
                            onClick={() => void mutate(decision, "DEFER")}
                          >
                            {t("defer")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === decision.id}
                            onClick={() => void mutate(decision, "REJECT")}
                          >
                            {t("reject")}
                          </Button>
                        </>
                      ) : null}
                      {!targetValid &&
                      decision.actionType === "CREATE_KANBAN_CARD" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === decision.id}
                          onClick={() => void showDecision(decision.id)}
                        >
                          {t("chooseKanbanTarget")}
                        </Button>
                      ) : decision.executionStatus === "READY" ||
                        decision.executionStatus === "FAILED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === decision.id}
                          onClick={() => void mutate(decision, "RETRY")}
                        >
                          {t("retry")}
                        </Button>
                      ) : null}
                      {decision.targetAvailability === "UNAVAILABLE" ? (
                        <Badge variant="outline">
                          {t("resultUnavailable")}
                        </Badge>
                      ) : resultHref ? (
                        <Button
                          size="sm"
                          variant="link"
                          render={<Link href={resultHref} />}
                        >
                          {t("openResult")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {decisionDetail.state === "loading" ? (
            <Skeleton className="h-48 w-full" />
          ) : decisionDetail.state === "error" ? (
            <LoadError
              title={t("decisionDetailErrorTitle")}
              description={t("decisionDetailErrorDescription")}
            />
          ) : decisionDetail.value ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-heading font-medium">
                  {decisionDetail.value.title}
                </h3>
                {decisionDetail.value.context ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {decisionDetail.value.context}
                  </p>
                ) : null}
                {decisionDetail.value.recommendation ? (
                  <p className="mt-2 text-sm">
                    {decisionDetail.value.recommendation}
                  </p>
                ) : null}
              </div>
              {decisionDetail.value.evidenceRefs.length ? (
                <div>
                  <div className="text-sm font-medium">
                    {t("evidenceTitle")}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {decisionDetail.value.evidenceRefs.map((reference) => {
                      const href = evidenceHref(reference);
                      return (
                        <li key={reference}>
                          {href ? (
                            <Button
                              size="sm"
                              variant="outline"
                              render={<Link href={href} />}
                            >
                              {reference}
                            </Button>
                          ) : (
                            <Badge variant="outline">{reference}</Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {decisionDetail.value.status === "OPEN" ||
              decisionDetail.value.status === "DEFERRED" ||
              decisionDetail.value.executionStatus === "FAILED" ||
              decisionDetail.value.executionStatus === "NEEDS_REBIND" ? (
                <div className="space-y-2">
                  {editorNeedsKanbanTarget ? (
                    kanbanTargets.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="management-kanban-board">
                            {t("kanbanBoardLabel")}
                          </FieldLabel>
                          <NativeSelect
                            id="management-kanban-board"
                            value={selectedKanbanBoardId}
                            onChange={(event) => {
                              const boardId = event.target.value;
                              const board = kanbanTargets.find(
                                (candidate) => candidate.id === boardId,
                              );
                              setKanbanBoardId(boardId);
                              setActionJson(
                                withKanbanColumnId(
                                  actionJson,
                                  board?.columns[0]?.id ?? "",
                                ),
                              );
                            }}
                          >
                            <NativeSelectOption value="">
                              {t("selectKanbanBoard")}
                            </NativeSelectOption>
                            {kanbanTargets.map((board) => (
                              <NativeSelectOption
                                key={board.id}
                                value={board.id}
                              >
                                {board.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="management-kanban-column">
                            {t("kanbanColumnLabel")}
                          </FieldLabel>
                          <NativeSelect
                            id="management-kanban-column"
                            value={editorKanbanTarget?.column.id ?? ""}
                            disabled={!selectedKanbanBoard}
                            onChange={(event) =>
                              setActionJson(
                                withKanbanColumnId(
                                  actionJson,
                                  event.target.value,
                                ),
                              )
                            }
                          >
                            <NativeSelectOption value="">
                              {t("selectKanbanColumn")}
                            </NativeSelectOption>
                            {selectedKanbanBoard?.columns.map((column) => (
                              <NativeSelectOption
                                key={column.id}
                                value={column.id}
                              >
                                {column.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">
                        {t("kanbanTargetsEmpty")}
                      </p>
                    )
                  ) : null}
                  <FieldLabel htmlFor="management-action-json">
                    {t(
                      editorNeedsKanbanTarget
                        ? "actionAdvancedEditor"
                        : "actionEditor",
                    )}
                  </FieldLabel>
                  <Textarea
                    id="management-action-json"
                    className="min-h-40 font-mono text-xs"
                    value={actionJson}
                    onChange={(event) => setActionJson(event.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={
                      !actionJson.trim() ||
                      !editorHasValidKanbanTarget ||
                      busyId === decisionDetail.value.id
                    }
                    onClick={() =>
                      void saveAction(
                        decisionDetail.value?.executionStatus ===
                          "NEEDS_REBIND",
                      )
                    }
                  >
                    {editorNeedsKanbanTarget
                      ? t("saveKanbanTarget")
                      : decisionDetail.value.executionStatus === "NEEDS_REBIND"
                        ? t("rebind")
                        : t("saveAction")}
                  </Button>
                </div>
              ) : decisionDetail.value.actionType ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(
                    {
                      type: decisionDetail.value.actionType,
                      payload: decisionDetail.value.actionPayload,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
              <div>
                <div className="text-sm font-medium">{t("auditTitle")}</div>
                <ol className="mt-2 space-y-2">
                  {decisionDetail.value.events.map((event) => (
                    <li key={event.id} className="rounded border p-2 text-xs">
                      <span className="font-medium">
                        {event.sequence}. {event.type}
                      </span>
                      {event.actorName ? ` · ${event.actorName}` : ""}
                      {event.errorMessage ? (
                        <div className="mt-1 text-destructive">
                          {event.errorMessage}
                        </div>
                      ) : null}
                      {event.fromStatus || event.toStatus ? (
                        <div className="mt-1 text-muted-foreground">
                          {t("auditDecisionState")}: {event.fromStatus ?? "—"} →{" "}
                          {event.toStatus ?? "—"}
                        </div>
                      ) : null}
                      {event.fromExecutionStatus || event.toExecutionStatus ? (
                        <div className="text-muted-foreground">
                          {t("auditExecutionState")}:{" "}
                          {event.fromExecutionStatus ?? "—"} →{" "}
                          {event.toExecutionStatus ?? "—"}
                        </div>
                      ) : null}
                      <div className="text-muted-foreground">
                        {t("auditRevision")}: {event.actionRevision ?? 0}
                        {event.payloadHash
                          ? ` · SHA-256 ${event.payloadHash}`
                          : ""}
                      </div>
                      {event.receiptId ? (
                        <div className="text-muted-foreground">
                          {t("auditReceipt")}: {event.receiptId}
                        </div>
                      ) : null}
                      {event.targetType || event.targetId ? (
                        <div className="text-muted-foreground">
                          {t("auditTarget")}: {event.targetType ?? "—"} ·{" "}
                          {event.targetLabel ?? event.targetId ?? "—"}
                          {event.targetId ? ` (${event.targetId})` : ""}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageBody>
  );
}

function LoadError({
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
