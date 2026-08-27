"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { AgentScheduleSummary } from "@/lib/services/agent-schedules";
import { agentSchedulesApi, ApiError } from "./api";
import { ScheduleDialog, type ScheduleDialogState } from "./schedule-dialog";

interface AgentSchedulesCardProps {
  agentId: string;
  schedules: AgentScheduleSummary[];
}

export function AgentSchedulesCard({
  agentId,
  schedules,
}: AgentSchedulesCardProps) {
  const t = useTranslations("agents");
  const format = useFormatter();
  const router = useRouter();
  const [dialogState, setDialogState] = useState<ScheduleDialogState | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] =
    useState<AgentScheduleSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await agentSchedulesApi.remove(agentId, pendingDelete.id);
      toast.success(t("scheduleDeletedToast"));
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("deleteScheduleError"),
      );
    } finally {
      setDeleting(false);
    }
  }

  // One line describing the recurrence, in the schedule's own zone — the
  // dashboard renders in UTC, so the zone has to be spelled out.
  function describe(schedule: AgentScheduleSummary): string {
    if (schedule.kind === "INTERVAL") {
      return `${t("scheduleKindINTERVAL")} · ${(schedule.intervalSeconds ?? 0) / 60}`;
    }
    const minutes = schedule.minuteOfDay ?? 0;
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
      minutes % 60,
    ).padStart(2, "0")}`;
    const base = `${clock} ${schedule.timeZone}`;
    if (schedule.kind === "DAILY") return `${t("scheduleKindDAILY")} · ${base}`;
    const dayNames = schedule.daysOfWeek
      .map(
        (day) =>
          [
            t("weekdaySun"),
            t("weekdayMon"),
            t("weekdayTue"),
            t("weekdayWed"),
            t("weekdayThu"),
            t("weekdayFri"),
            t("weekdaySat"),
          ][day],
      )
      .join(", ");
    return `${dayNames} · ${base}`;
  }

  return (
    <>
      <Card id="schedules" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>
            <h2>{t("schedulesTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("schedulesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {schedules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("noSchedulesYet")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {schedules.map((schedule) => (
                <li
                  key={schedule.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="font-medium">{schedule.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {describe(schedule)} · {t("scheduleNextRun")}:{" "}
                      {format.dateTime(new Date(schedule.nextRunAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={schedule.isActive ? "default" : "secondary"}
                    >
                      {schedule.isActive
                        ? t("statusActive")
                        : t("statusInactive")}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialogState({ mode: "edit", schedule })}
                    >
                      {t("editAction")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(schedule)}
                    >
                      {t("deleteAction")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogState({ mode: "create" })}
            >
              <Icon name="ri-time-line" aria-hidden data-icon="inline-start" />
              {t("newScheduleButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ScheduleDialog
        agentId={agentId}
        state={dialogState}
        onOpenChange={(open) => {
          if (!open) setDialogState(null);
        }}
        onSaved={() => {
          setDialogState(null);
          router.refresh();
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteScheduleTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteScheduleDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("deletingButton") : t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
