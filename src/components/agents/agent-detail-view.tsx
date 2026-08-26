"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation";
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
import type { AgentScope } from "@/lib/agents/scopes";
import type { AgentDetail } from "@/lib/services/agents";
import type { AgentScheduleSummary } from "@/lib/services/agent-schedules";
import type { SkillSummary } from "@/lib/services/skills";
import { agentsApi, ApiError } from "./api";
import { AgentDialog, type AgentDialogState } from "./agent-dialog";
import { AgentScopesField } from "./agent-scopes-field";
import { AgentSchedulesCard } from "./agent-schedules-card";
import { RunDialog } from "./run-dialog";

interface AgentDetailViewProps {
  agent: AgentDetail;
  skills: SkillSummary[];
  schedules: AgentScheduleSummary[];
}

export function AgentDetailView({
  agent,
  skills,
  schedules,
}: AgentDetailViewProps) {
  const t = useTranslations("agents");
  const router = useRouter();
  const [dialogState, setDialogState] = useState<AgentDialogState | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  const [scopes, setScopes] = useState<AgentScope[]>(agent.scopes);
  const [savingScopes, setSavingScopes] = useState(false);

  const [attached, setAttached] = useState<string[]>(
    agent.skills.map((skill) => skill.id),
  );
  const [savingSkills, setSavingSkills] = useState(false);

  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const available = skills.filter((skill) => !attached.includes(skill.id));

  async function saveScopes() {
    setSavingScopes(true);
    try {
      await agentsApi.update(agent.id, { scopes });
      toast.success(t("accessSavedToast"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveAgentError"));
    } finally {
      setSavingScopes(false);
    }
  }

  async function saveSkills() {
    setSavingSkills(true);
    try {
      await agentsApi.setSkills(agent.id, attached);
      toast.success(t("skillsSavedToast"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveAgentError"));
    } finally {
      setSavingSkills(false);
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= attached.length) return;
    const next = [...attached];
    [next[index], next[target]] = [next[target], next[index]];
    setAttached(next);
  }

  return (
    <>
      <PageHeader
        back={{ href: "/agents/agents", label: t("backToAgents") }}
        title={agent.name}
        description={agent.description ?? undefined}
        actions={
          <>
            <Button
              render={<Link href={`/agents?agentId=${agent.id}`} />}
              nativeButton={false}
              variant="outline"
              disabled={!agent.isActive}
            >
              <Icon
                name="ri-message-2-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("startChatButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogState({ mode: "edit", agent })}
            >
              <Icon name="ri-edit-line" aria-hidden data-icon="inline-start" />
              {t("editAction")}
            </Button>
            <Button
              type="button"
              disabled={!agent.isActive}
              onClick={() => setRunOpen(true)}
            >
              <Icon name="ri-play-line" aria-hidden data-icon="inline-start" />
              {t("runNowButton")}
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-6">
          <AgentSchedulesCard agentId={agent.id} schedules={schedules} />

          <Card>
            <CardHeader>
              <CardTitle>{t("accessTitle")}</CardTitle>
              <CardDescription>{t("accessDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AgentScopesField
                value={scopes}
                onChange={setScopes}
                disabled={savingScopes}
              />
              <div>
                <Button
                  type="button"
                  onClick={saveScopes}
                  disabled={savingScopes}
                >
                  {savingScopes ? t("savingButton") : t("saveAccessButton")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("skillsTitle")}</CardTitle>
              <CardDescription>{t("skillsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-6 md:grid-cols-2">
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {t("attachedSkillsLabel")}
                  </h3>
                  {attached.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("noSkillsAttached")}
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {attached.map((skillId, index) => (
                        <li
                          key={skillId}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <span className="text-sm">
                            {skillsById.get(skillId)?.name ?? skillId}
                          </span>
                          <span className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={t("moveUpAction")}
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <Icon name="ri-arrow-up-line" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={t("moveDownAction")}
                              disabled={index === attached.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <Icon name="ri-arrow-down-line" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setAttached(
                                  attached.filter((id) => id !== skillId),
                                )
                              }
                            >
                              {t("detachSkillAction")}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {t("availableSkillsLabel")}
                  </h3>
                  {available.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("noSkillsAvailable")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {available.map((skill) => (
                        <li
                          key={skill.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <span className="text-sm">
                            {skill.name}
                            <span className="text-muted-foreground block text-xs">
                              {skill.description}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAttached([...attached, skill.id])}
                          >
                            {t("attachSkillAction")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <div>
                <Button
                  type="button"
                  onClick={saveSkills}
                  disabled={savingSkills}
                >
                  {savingSkills ? t("savingButton") : t("saveSkillsButton")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

      <RunDialog
        agentId={agent.id}
        agentName={agent.name}
        open={runOpen}
        onOpenChange={setRunOpen}
      />
    </>
  );
}
