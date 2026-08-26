"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentSummary } from "@/lib/services/agents";
import { agentsApi, ApiError } from "./api";
import { AgentDialog, type AgentDialogState } from "./agent-dialog";

interface AgentsViewProps {
  agents: AgentSummary[];
}

export function AgentsView({ agents }: AgentsViewProps) {
  const t = useTranslations("agents");
  const format = useFormatter();
  const router = useRouter();
  const [dialogState, setDialogState] = useState<AgentDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await agentsApi.remove(pendingDelete.id);
      toast.success(t("agentDeletedToast"));
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("deleteAgentError"),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button
              render={<Link href="/agents" />}
              nativeButton={false}
              variant="outline"
            >
              <Icon
                name="ri-message-2-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("chatsButton")}
            </Button>
            <Button
              render={<Link href="/agents/runs" />}
              nativeButton={false}
              variant="outline"
            >
              <Icon
                name="ri-play-circle-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("runsButton")}
            </Button>
            <Button
              render={<Link href="/agents/skills" />}
              nativeButton={false}
              variant="outline"
            >
              <Icon
                name="ri-lightbulb-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("manageSkillsButton")}
            </Button>
            <Button
              type="button"
              onClick={() => setDialogState({ mode: "create" })}
            >
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("newAgentButton")}
            </Button>
          </>
        }
      />
      <PageBody>
        {agents.length === 0 ? (
          <EmptyState
            icon="ri-robot-2-line"
            title={t("noAgentsTitle")}
            description={t("noAgentsDescription")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameColumn")}</TableHead>
                <TableHead>{t("accessColumn")}</TableHead>
                <TableHead>{t("skillsColumn")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <TableHead>{t("lastRunColumn")}</TableHead>
                <TableHead className="text-right">
                  {t("actionsColumn")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <Link
                      href={`/agents/${agent.id}`}
                      className="font-medium hover:underline"
                    >
                      {agent.name}
                    </Link>
                    {agent.description ? (
                      <p className="text-muted-foreground text-sm">
                        {agent.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {agent.scopes.length === 0
                      ? t("noAccessGranted")
                      : t("scopeCount", { count: agent.scopes.length })}
                  </TableCell>
                  <TableCell>
                    {t("skillCount", { count: agent.skillCount })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.isActive ? "default" : "secondary"}>
                      {agent.isActive ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {agent.lastRunAt
                      ? format.dateTime(agent.lastRunAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : t("neverRun")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={<Link href={`/agents/${agent.id}`} />}
                      nativeButton={false}
                      variant="ghost"
                      size="sm"
                    >
                      {t("openAction")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(agent)}
                    >
                      {t("deleteAction")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageBody>

      <AgentDialog
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
              {t("deleteAgentTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteAgentDescription")}
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
