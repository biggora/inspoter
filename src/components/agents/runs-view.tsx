"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/shell/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentRunSummary } from "@/lib/services/agent-runs";
import { agentRunsApi, ApiError } from "./api";
import { RunStatusBadge } from "./run-status-badge";

interface RunsViewProps {
  runs: AgentRunSummary[];
  /** Keyset cursor of the page after the one rendered on the server. */
  nextCursor: string | null;
}

export function formatDuration(run: AgentRunSummary): string | null {
  if (!run.startedAt || !run.completedAt) return null;
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(run.completedAt).getTime() -
        new Date(run.startedAt).getTime()) /
        1000,
    ),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function RunsView({
  runs: initialRuns,
  nextCursor: initialCursor,
}: RunsViewProps) {
  const t = useTranslations("agents");
  const format = useFormatter();

  // The first page is server-rendered; the client takes over only once the
  // operator navigates. `pageCursors[i]` is the cursor that produced page i,
  // so going back is a re-fetch rather than a cache — the same keyset paging
  // the Activity and Logs sections use.
  const [runs, setRuns] = useState(initialRuns);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  async function loadPage(index: number, cursor: string | null) {
    setLoading(true);
    try {
      const result = await agentRunsApi.list(cursor ? { cursor } : {});
      setRuns(result.items);
      setNextCursor(result.nextCursor);
      setPageIndex(index);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("runError"));
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (!nextCursor) return;
    const cursors = [...pageCursors.slice(0, pageIndex + 1), nextCursor];
    setPageCursors(cursors);
    void loadPage(pageIndex + 1, nextCursor);
  }

  function handlePrevious() {
    if (pageIndex === 0) return;
    void loadPage(pageIndex - 1, pageCursors[pageIndex - 1] ?? null);
  }

  return (
    <>
      <PageHeader
        back={{ href: "/agents", label: t("backToAgents") }}
        title={t("runsTitle")}
        description={t("runsDescription")}
      />
      <PageBody>
        {runs.length === 0 ? (
          <EmptyState
            icon="ri-play-circle-line"
            title={t("noRunsTitle")}
            description={t("noRunsDescription")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("agentColumn")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <TableHead>{t("startedColumn")}</TableHead>
                <TableHead>{t("durationColumn")}</TableHead>
                <TableHead>{t("stepsColumn")}</TableHead>
                <TableHead>{t("tokensColumn")}</TableHead>
                <TableHead className="text-right">
                  {t("actionsColumn")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.agentName}</TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    {run.startedAt
                      ? format.dateTime(new Date(run.startedAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>{formatDuration(run) ?? "—"}</TableCell>
                  <TableCell>{run.stepCount}</TableCell>
                  <TableCell>{run.totalTokens}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={<Link href={`/agents/runs/${run.id}`} />}
                      nativeButton={false}
                      variant="ghost"
                      size="sm"
                    >
                      {t("openAction")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination
          page={pageIndex + 1}
          hasPrevious={pageIndex > 0}
          hasNext={Boolean(nextCursor)}
          onPrevious={handlePrevious}
          onNext={handleNext}
          disabled={loading}
        />
      </PageBody>
    </>
  );
}
