"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { AgentRunDetail } from "@/lib/services/agent-runs";
import { agentRunsApi, ApiError } from "./api";
import { RunStatusBadge } from "./run-status-badge";

const TERMINAL: ReadonlySet<AgentRunDetail["status"]> = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

const POLL_MS = 3_000;

interface RunDetailViewProps {
  run: AgentRunDetail;
  /** The page of runs this one was opened from, cursor stack intact. */
  backHref: string;
}

export function RunDetailView({ run: initial, backHref }: RunDetailViewProps) {
  const t = useTranslations("agents");
  const format = useFormatter();
  const [run, setRun] = useState(initial);
  const [cancelling, setCancelling] = useState(false);

  const isTerminal = TERMINAL.has(run.status);

  // A queued run becomes a running one on the scheduler's next tick, so the
  // page follows it until it settles and then stops. Polling one row every
  // three seconds needs no new infrastructure; a live channel would.
  useEffect(() => {
    if (isTerminal) return;
    const timer = setInterval(() => {
      agentRunsApi
        .get(run.id)
        .then(setRun)
        .catch(() => {
          // A transient failure just means the next tick tries again.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isTerminal, run.id]);

  async function handleCancel() {
    setCancelling(true);
    try {
      setRun(await agentRunsApi.cancel(run.id));
      toast.success(t("runCancelledToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("cancelRunError"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: t("backToRuns") }}
        title={run.agentName}
        description={
          run.startedAt
            ? format.dateTime(new Date(run.startedAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : t("runPendingHint")
        }
        actions={
          isTerminal ? undefined : (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={cancelling}
            >
              <Icon name="ri-stop-line" aria-hidden data-icon="inline-start" />
              {t("cancelRunButton")}
            </Button>
          )
        }
      />
      <PageBody>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <RunStatusBadge status={run.status} />
            <span className="text-muted-foreground text-sm">
              {t("stepsColumn")}: {run.stepCount} · {t("tokensColumn")}:{" "}
              {run.totalTokens}
            </span>
          </div>

          {run.input ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("runTaskTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{run.input}</p>
              </CardContent>
            </Card>
          ) : null}

          {run.lastError ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("runErrorTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive text-sm whitespace-pre-wrap">
                  {run.lastError}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("runSummaryTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {run.summary || t("runNoSummary")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("runTimelineTitle")}</CardTitle>
              <CardDescription>{t("runsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {run.steps.map((step) => (
                  <li
                    key={step.id}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {step.kind === "MODEL_CALL"
                          ? t("stepModelCall")
                          : t("stepToolCall")}
                      </span>
                      {step.toolName ? (
                        <code className="text-muted-foreground text-xs">
                          {step.toolName}
                        </code>
                      ) : null}
                      <span className="text-muted-foreground text-xs">
                        {step.durationMs} ms
                      </span>
                    </div>
                    <pre className="text-muted-foreground mt-1 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                      {step.modelText ?? step.resultText ?? t("stepNoOutput")}
                    </pre>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
