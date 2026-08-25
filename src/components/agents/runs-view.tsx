"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentRunSummary } from "@/lib/services/agent-runs";
import { RunStatusBadge } from "./run-status-badge";

interface RunsViewProps {
  runs: AgentRunSummary[];
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

export function RunsView({ runs }: RunsViewProps) {
  const t = useTranslations("agents");
  const format = useFormatter();

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
      </PageBody>
    </>
  );
}
