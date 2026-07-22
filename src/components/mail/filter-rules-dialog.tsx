"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import {
  ApiError,
  deleteMailFilterRule,
  fetchMailFilterRun,
  fetchMailFilterRules,
  patchMailFilterRule,
  retryMailFilterRun,
  type MailFilterRunDto,
  type MailFilterRuleDto,
} from "./api";
import { FilterRuleForm } from "./filter-rule-dialog";
import { LabelChip } from "./label-chip";

const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  ACTIVE_RULE_LIMIT_REACHED: "errorRuleLimitReached",
  RESOURCE_NOT_FOUND: "errorFilterResourceNotFound",
  WORKSPACE_OWNER_REQUIRED: "errorOwnerRequired",
  FILTER_RUN_NOT_RETRYABLE: "errorFilterRunNotRetryable",
};

const FILTER_RUN_POLL_INTERVAL_MS = 2_000;
const FILTER_RUN_MAX_POLLS = 60;

function isActiveRun(run: MailFilterRunDto): boolean {
  return run.status === "PENDING" || run.status === "RUNNING";
}

function filterRunStatusVariant(
  status: MailFilterRunDto["status"],
): "success" | "error" | "info" | "outline" {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "error";
  if (status === "RUNNING") return "info";
  return "outline";
}

interface FilterRunDetailsProps {
  initialRun: MailFilterRunDto;
  ruleName: string;
  onRunChanged: (run: MailFilterRunDto) => void;
  onBack: () => void;
}

function FilterRunDetails({
  initialRun,
  ruleName,
  onRunChanged,
  onBack,
}: FilterRunDetailsProps) {
  const t = useTranslations("mail");
  const [run, setRun] = useState(initialRun);
  const [pollSession, setPollSession] = useState(0);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pollCountRef = useRef(0);
  const backButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  function updateRun(nextRun: MailFilterRunDto) {
    setRun(nextRun);
    onRunChanged(nextRun);
  }

  useEffect(() => {
    if (!isActiveRun(run)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (cancelled) return;
      if (pollCountRef.current >= FILTER_RUN_MAX_POLLS) {
        setPollingPaused(true);
        return;
      }
      pollCountRef.current += 1;

      try {
        const nextRun = await fetchMailFilterRun(run.id);
        if (cancelled) return;
        updateRun(nextRun);
        if (isActiveRun(nextRun)) {
          timer = setTimeout(poll, FILTER_RUN_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    timer = setTimeout(poll, FILTER_RUN_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `pollSession` deliberately restarts one bounded serial polling window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollSession, run.id, run.status]);

  async function handleRefresh() {
    if (refreshing || retrying) return;
    setRefreshing(true);
    setLoadError(false);
    try {
      const nextRun = await fetchMailFilterRun(run.id);
      updateRun(nextRun);
      setPollingPaused(false);
      backButtonRef.current?.focus();
      if (isActiveRun(nextRun)) {
        pollCountRef.current = 0;
        setPollSession((value) => value + 1);
      }
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRetry() {
    if (retrying || refreshing || run.status !== "FAILED") return;
    setRetrying(true);
    setLoadError(false);
    try {
      const nextRun = await retryMailFilterRun(run.id);
      updateRun(nextRun);
      setPollingPaused(false);
      pollCountRef.current = 0;
      setPollSession((value) => value + 1);
      backButtonRef.current?.focus();
      toast.success(t("filterRunRetryStartedToast"));
    } catch (error) {
      const key =
        error instanceof ApiError
          ? ERROR_TRANSLATION_KEYS[error.message]
          : undefined;
      toast.error(key ? t(key) : t("errorRetryFilterRun"));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col gap-4"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {isActiveRun(run) && <Spinner aria-hidden />}
            <Badge variant={filterRunStatusVariant(run.status)}>
              {t(`filterRunStatus${run.status}`)}
            </Badge>
            <p className="min-w-0 wrap-anywhere text-sm font-medium">
              {ruleName}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">
                {t("filterRunProcessedLabel")}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {run.processedCount}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">
                {t("filterRunMatchedLabel")}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {run.matchedCount}
              </dd>
            </div>
          </dl>
        </div>

        {run.status === "FAILED" && (
          <Alert variant="error">
            <Icon name="ri-error-warning-line" aria-hidden />
            <AlertTitle>{t("filterRunFailedTitle")}</AlertTitle>
            <AlertDescription>
              {t("filterRunFailedDescription", { attempts: run.attempts })}
            </AlertDescription>
          </Alert>
        )}

        {loadError && (
          <Alert variant="error">
            <Icon name="ri-wifi-off-line" aria-hidden />
            <AlertTitle>{t("filterRunStatusErrorTitle")}</AlertTitle>
            <AlertDescription>
              {t("filterRunStatusErrorDescription")}
            </AlertDescription>
          </Alert>
        )}

        {pollingPaused && isActiveRun(run) && (
          <Alert variant="info">
            <Icon name="ri-pause-circle-line" aria-hidden />
            <AlertTitle>{t("filterRunPollingPausedTitle")}</AlertTitle>
            <AlertDescription>
              {t("filterRunPollingPausedDescription")}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-background-100 p-4 sm:flex-row sm:justify-end">
        <Button
          ref={backButtonRef}
          type="button"
          variant="outline"
          onClick={onBack}
        >
          {t("backToFilterRulesButton")}
        </Button>
        {(loadError || pollingPaused) && (
          <Button
            type="button"
            variant="outline"
            disabled={refreshing || retrying}
            onClick={() => void handleRefresh()}
          >
            {refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
            )}
            {t("filterRunRefreshButton")}
          </Button>
        )}
        {run.status === "FAILED" && (
          <Button
            type="button"
            disabled={retrying || refreshing}
            onClick={() => void handleRetry()}
          >
            {retrying && <Spinner data-icon="inline-start" />}
            {t("filterRunRetryButton")}
          </Button>
        )}
      </div>
    </div>
  );
}

export interface FilterRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  onRulesChanged: () => void;
}

export function FilterRulesDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
  onRulesChanged,
}: FilterRulesDialogProps) {
  const t = useTranslations("mail");
  const [rules, setRules] = useState<MailFilterRuleDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [editingRule, setEditingRule] = useState<MailFilterRuleDto | null>(
    null,
  );
  const [viewingRun, setViewingRun] = useState<{
    ruleId: string;
    ruleName: string;
    run: MailFilterRunDto;
  } | null>(null);
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<MailFilterRuleDto | null>(
    null,
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const runButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!open || editingRule || viewingRun) return;
    let cancelled = false;
    async function load() {
      setLoadError(false);
      try {
        const result = await fetchMailFilterRules(accountId);
        if (!cancelled) setRules(result);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setRules(null);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, editingRule, open, reload, viewingRun]);

  useEffect(() => {
    if (editingRule || viewingRun || !focusRuleId || !rules) return;
    requestAnimationFrame(() => {
      const target =
        runButtonRefs.current.get(focusRuleId) ??
        editButtonRefs.current.get(focusRuleId);
      target?.focus();
      setFocusRuleId(null);
    });
  }, [editingRule, focusRuleId, rules, viewingRun]);

  function translatedError(error: unknown, fallback: string): string {
    if (!(error instanceof ApiError)) return fallback;
    const key = ERROR_TRANSLATION_KEYS[error.message];
    return key ? t(key) : error.message;
  }

  async function mutateRule(
    rule: MailFilterRuleDto,
    input: { isActive: boolean } | { position: number },
    successMessage: string,
  ) {
    if (pendingRuleId) return;
    setPendingRuleId(rule.id);
    try {
      await patchMailFilterRule(rule.id, input);
      toast.success(successMessage);
      setReload((value) => value + 1);
      onRulesChanged();
    } catch (error) {
      toast.error(translatedError(error, t("errorUpdateFilterRule")));
    } finally {
      setPendingRuleId(null);
    }
  }

  async function handleDelete() {
    if (!deletingRule || pendingRuleId) return;
    const rule = deletingRule;
    setPendingRuleId(rule.id);
    try {
      await deleteMailFilterRule(rule.id);
      setDeletingRule(null);
      toast.success(t("filterRuleDeletedToast"));
      setReload((value) => value + 1);
      onRulesChanged();
    } catch (error) {
      toast.error(translatedError(error, t("errorDeleteFilterRule")));
    } finally {
      setPendingRuleId(null);
    }
  }

  function returnToList(ruleId: string) {
    setFocusRuleId(ruleId);
    setEditingRule(null);
    setViewingRun(null);
    setRules(null);
    setReload((value) => value + 1);
  }

  function handleRunChanged(ruleId: string, run: MailFilterRunDto) {
    setRules(
      (current) =>
        current?.map((rule) =>
          rule.id === ruleId ? { ...rule, latestRun: run } : rule,
        ) ?? null,
    );
  }

  const busy = pendingRuleId !== null || formSubmitting;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!busy || nextOpen) onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-background-100 p-4 pr-12">
            <div className="flex min-w-0 items-start gap-2">
              {(editingRule || viewingRun) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("backToFilterRulesButton")}
                  disabled={formSubmitting}
                  onClick={() =>
                    returnToList(editingRule?.id ?? viewingRun!.ruleId)
                  }
                >
                  <Icon name="ri-arrow-left-line" aria-hidden />
                </Button>
              )}
              <div className="min-w-0">
                <DialogTitle>
                  {editingRule
                    ? t("editFilterRuleTitle")
                    : viewingRun
                      ? t("filterRunDialogTitle")
                      : t("manageFilterRulesTitle")}
                </DialogTitle>
                <DialogDescription>
                  {editingRule
                    ? t("editFilterRuleDescription")
                    : viewingRun
                      ? t("filterRunDialogDescription")
                      : t("manageFilterRulesDescription", {
                          account: accountName,
                        })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {editingRule ? (
            <FilterRuleForm
              key={editingRule.id}
              accountId={accountId}
              accountName={accountName}
              initialRule={editingRule}
              onSubmittingChange={setFormSubmitting}
              onCancel={() => returnToList(editingRule.id)}
              onSaved={() => {
                onRulesChanged();
                returnToList(editingRule.id);
              }}
            />
          ) : viewingRun ? (
            <FilterRunDetails
              key={viewingRun.run.id}
              initialRun={viewingRun.run}
              ruleName={viewingRun.ruleName}
              onRunChanged={(run) => handleRunChanged(viewingRun.ruleId, run)}
              onBack={() => returnToList(viewingRun.ruleId)}
            />
          ) : (
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {loadError ? (
                  <EmptyState
                    bordered={false}
                    tone="danger"
                    icon="ri-filter-off-line"
                    title={t("errorLoadFilterRulesTitle")}
                    description={t("errorLoadFilterRules")}
                    action={
                      <Button
                        type="button"
                        onClick={() => {
                          setRules(null);
                          setReload((value) => value + 1);
                        }}
                      >
                        <Icon
                          name="ri-refresh-line"
                          aria-hidden
                          data-icon="inline-start"
                        />
                        {t("retryButton")}
                      </Button>
                    }
                  />
                ) : rules === null ? (
                  <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Spinner aria-label={t("loadingFilterRulesLabel")} />
                    {t("loadingFilterRulesLabel")}
                  </div>
                ) : rules.length === 0 ? (
                  <EmptyState
                    bordered={false}
                    icon="ri-filter-line"
                    title={t("filterRulesEmptyTitle")}
                    description={t("filterRulesEmptyDescription")}
                  />
                ) : (
                  <ul
                    className="flex flex-col gap-2"
                    aria-label={t("filterRulesListLabel")}
                  >
                    {rules.map((rule, index) => {
                      const pending = pendingRuleId === rule.id;
                      return (
                        <li
                          key={rule.id}
                          className="rounded-lg border border-background-200 bg-background-50 p-3"
                        >
                          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 flex-col gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-foreground-900">
                                  {rule.name}
                                </p>
                                <Badge variant="outline">
                                  {rule.isActive
                                    ? t("filterRuleActiveState")
                                    : t("filterRuleInactiveState")}
                                </Badge>
                                <LabelChip
                                  label={{
                                    name: rule.label.name,
                                    color: rule.label.color,
                                  }}
                                />
                              </div>
                              <p className="break-words text-xs text-muted-foreground">
                                {rule.fromAddress &&
                                  t("filterRuleSenderSummary", {
                                    sender: rule.fromAddress,
                                  })}
                                {rule.fromAddress && rule.subjectContains
                                  ? ` ${t("filterRuleAndConnector")} `
                                  : ""}
                                {rule.subjectContains &&
                                  t("filterRuleSubjectSummary", {
                                    subject: rule.subjectContains,
                                  })}
                              </p>
                              {rule.latestRun && (
                                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge
                                    variant={filterRunStatusVariant(
                                      rule.latestRun.status,
                                    )}
                                  >
                                    {t(
                                      `filterRunStatus${rule.latestRun.status}`,
                                    )}
                                  </Badge>
                                  <span className="tabular-nums">
                                    {t("filterRunCountsSummary", {
                                      processed: rule.latestRun.processedCount,
                                      matched: rule.latestRun.matchedCount,
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-1">
                              {rule.latestRun && (
                                <Button
                                  ref={(node) => {
                                    if (node)
                                      runButtonRefs.current.set(rule.id, node);
                                    else runButtonRefs.current.delete(rule.id);
                                  }}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setViewingRun({
                                      ruleId: rule.id,
                                      ruleName: rule.name,
                                      run: rule.latestRun!,
                                    })
                                  }
                                >
                                  <Icon
                                    name="ri-history-line"
                                    aria-hidden
                                    data-icon="inline-start"
                                  />
                                  {t("filterRunViewButton")}
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("moveFilterRuleUpButton", {
                                  rule: rule.name,
                                })}
                                title={t("moveUpButton")}
                                disabled={busy || index === 0}
                                onClick={() =>
                                  void mutateRule(
                                    rule,
                                    { position: index - 1 },
                                    t("filterRuleReorderedToast"),
                                  )
                                }
                              >
                                <Icon name="ri-arrow-up-line" aria-hidden />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("moveFilterRuleDownButton", {
                                  rule: rule.name,
                                })}
                                title={t("moveDownButton")}
                                disabled={busy || index === rules.length - 1}
                                onClick={() =>
                                  void mutateRule(
                                    rule,
                                    { position: index + 1 },
                                    t("filterRuleReorderedToast"),
                                  )
                                }
                              >
                                <Icon name="ri-arrow-down-line" aria-hidden />
                              </Button>
                              <Button
                                ref={(node) => {
                                  if (node)
                                    editButtonRefs.current.set(rule.id, node);
                                  else editButtonRefs.current.delete(rule.id);
                                }}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setEditingRule(rule)}
                              >
                                <Icon
                                  name="ri-edit-line"
                                  aria-hidden
                                  data-icon="inline-start"
                                />
                                {t("editButton")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void mutateRule(
                                    rule,
                                    { isActive: !rule.isActive },
                                    rule.isActive
                                      ? t("filterRuleDisabledToast")
                                      : t("filterRuleEnabledToast"),
                                  )
                                }
                              >
                                {pending ? (
                                  <Spinner data-icon="inline-start" />
                                ) : (
                                  <Icon
                                    name={
                                      rule.isActive
                                        ? "ri-pause-line"
                                        : "ri-play-line"
                                    }
                                    aria-hidden
                                    data-icon="inline-start"
                                  />
                                )}
                                {rule.isActive
                                  ? t("disableFilterRuleButton")
                                  : t("enableFilterRuleButton")}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-sm"
                                aria-label={t("deleteFilterRuleButton", {
                                  rule: rule.name,
                                })}
                                disabled={busy}
                                onClick={() => setDeletingRule(rule)}
                              >
                                <Icon name="ri-delete-bin-line" aria-hidden />
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 justify-end border-t border-background-100 p-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  {t("closeButton")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingRule)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !pendingRuleId) setDeletingRule(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteFilterRuleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteFilterRuleDescription", {
                rule: deletingRule?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingRuleId)}>
              {t("cancelButton")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(pendingRuleId)}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {pendingRuleId && <Spinner data-icon="inline-start" />}
              {t("deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
