"use client";

import { useFormatter, useTranslations } from "next-intl";

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
import { AgentSectionActions } from "./agent-section-actions";
import { runDetailHref, runsListHref } from "./runs-params";
import { RunStatusBadge } from "./run-status-badge";

interface RunsViewProps {
  runs: AgentRunSummary[];
  /** Keyset cursor of the page after the one rendered on the server. */
  nextCursor: string | null;
  /** Cursors walked to reach this page; `[]` is page 1. */
  cursors: string[];
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

// Paging is server-rendered from the URL's cursor stack, so this view holds no
// state of its own: stepping back drops the last cursor, stepping forward
// appends the next one. That is also what lets a run's detail page rebuild the
// page it was opened from.
export function RunsView({ runs, nextCursor, cursors }: RunsViewProps) {
  const t = useTranslations("agents");
  const format = useFormatter();

  return (
    <>
      <PageHeader
        title={t("runsTitle")}
        description={t("runsDescription")}
        actions={<AgentSectionActions current="runs" />}
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
                      render={<Link href={runDetailHref(run.id, cursors)} />}
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
          page={cursors.length + 1}
          previous={
            cursors.length > 0
              ? { href: runsListHref(cursors.slice(0, -1)) }
              : null
          }
          next={
            nextCursor ? { href: runsListHref([...cursors, nextCursor]) } : null
          }
        />
      </PageBody>
    </>
  );
}
