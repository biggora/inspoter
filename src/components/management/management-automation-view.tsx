"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import {
  automationPartStatus,
  evidenceHref,
  LoadError,
  parseBriefDetail,
  parseBriefs,
  parseSetup,
  requestJson,
  scheduleTime,
  type BriefDetail,
  type BriefSummary,
  type LoadState,
  type SetupSummary,
} from "./management-shared";

// The AI-brief configuration page (/management/automation) — provider,
// agent, skill, and schedule parts plus brief history, kept off the
// management landing so the landing reads as a decision surface, not a
// settings console (critique 2026-08-29, P2).

export function ManagementAutomationView() {
  const t = useTranslations("management");
  const format = useFormatter();
  const [setup, setSetup] = useState<LoadState<SetupSummary | null>>({
    state: "loading",
  });
  const [briefs, setBriefs] = useState<LoadState<BriefSummary[]>>({
    state: "loading",
  });
  const [briefDetail, setBriefDetail] = useState<LoadState<BriefDetail | null>>(
    { state: "ready", value: null },
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);

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

  useEffect(() => {
    void Promise.resolve().then(loadAi);
  }, [loadAi]);

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
        body: JSON.stringify({ period: "DAILY" }),
      });
      await loadAi();
    } catch {
      setMutationError(true);
    } finally {
      setBusyId(null);
    }
  }

  const setupValue = setup.state === "ready" ? setup.value : null;
  const scheduleDescription = (schedule: SetupSummary["parts"]["daily"]) => {
    const time = scheduleTime(schedule);
    if (!schedule) return t("automationNotCreated");
    if (!schedule.nextRunAt) return time ?? t("automationScheduleUnavailable");
    const nextRunAt = new Date(schedule.nextRunAt);
    const nextRun = Number.isNaN(nextRunAt.getTime())
      ? null
      : format.dateTime(nextRunAt, { dateStyle: "medium", timeStyle: "short" });
    return [time, nextRun ? t("automationNextRun", { value: nextRun }) : null]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
  };

  const automationParts = setupValue
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
      <PageHeader
        title={t("automationPageTitle")}
        description={t("automationPageDescription")}
      />
      {mutationError ? (
        <LoadError
          title={t("conflictTitle")}
          description={t("conflictDescription")}
        />
      ) : null}
      {setup.state === "loading" || briefs.state === "loading" ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : setup.state === "error" || briefs.state === "error" ? (
        <LoadError
          title={t("aiUnavailableTitle")}
          description={t("aiUnavailableDescription")}
        />
      ) : (
        <div className="space-y-8">
          <section aria-label={t("aiTitle")} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
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
                {automationParts.map((part) => (
                  <div
                    key={part.key}
                    className="flex min-h-48 flex-col rounded-lg border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon name={part.icon} className="text-lg" />
                      </span>
                      <Badge
                        variant={
                          part.status === "READY"
                            ? "success"
                            : part.status === "EDITED"
                              ? "warning"
                              : "error"
                        }
                      >
                        {part.status === "READY"
                          ? t("automationStatusReady")
                          : part.status === "EDITED"
                            ? t("automationStatusEdited")
                            : t("automationStatusMissing")}
                      </Badge>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {part.title}
                      </div>
                      <div className="mt-1 font-medium">{part.name}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {part.description}
                      </p>
                    </div>
                    <div className="mt-auto pt-4">
                      {part.repair ? (
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
                      ) : part.href ? (
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={part.href} />}
                          nativeButton={false}
                        >
                          <Icon
                            name="ri-settings-3-line"
                            aria-hidden
                            data-icon="inline-start"
                          />
                          {part.key === "provider"
                            ? t("automationConfigureProvider")
                            : t("automationOpenSettings")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-label={t("briefHistoryLabel")} className="space-y-3">
            <h2 className="font-heading font-medium">
              {t("briefHistoryLabel")}
            </h2>
            {briefs.value.length ? (
              <ul className="space-y-2">
                {briefs.value.slice(0, 5).map((brief) => (
                  <li key={brief.id} className="rounded-lg border p-3">
                    <div className="font-medium">{brief.headline}</div>
                    {brief.summary ? (
                      <p className="mt-1 line-clamp-2 max-w-prose text-sm text-muted-foreground">
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
          </section>

          {briefDetail.state === "loading" ? (
            <Skeleton className="h-24 w-full" />
          ) : briefDetail.state === "error" ? (
            <LoadError
              title={t("briefDetailErrorTitle")}
              description={t("briefDetailErrorDescription")}
            />
          ) : briefDetail.value ? (
            <article className="space-y-5 rounded-lg border p-4">
              <h2 className="font-heading font-medium">
                {briefDetail.value.headline}
              </h2>
              {briefDetail.value.summary ? (
                <p className="max-w-prose text-sm text-muted-foreground">
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
                    <h3 className="text-sm font-medium">{t(section.name)}</h3>
                    <Badge variant="outline">{section.items.length}</Badge>
                  </div>
                  {section.items.length ? (
                    <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                      {section.items.map((item, itemIndex) => (
                        <li
                          key={`${section.name}-${itemIndex}-${item.title}`}
                          className="rounded-lg border p-3"
                        >
                          <h4 className="font-medium">{item.title}</h4>
                          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
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
                                    <Badge key={reference} variant="outline">
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
        </div>
      )}
    </PageBody>
  );
}
