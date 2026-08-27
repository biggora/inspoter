"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentSummary } from "@/lib/services/agents";
import type {
  AgentConversationDetail,
  AgentConversationSummary,
} from "@/lib/services/agent-conversations";
import type { AgentScope } from "@/lib/agents/scopes";
import {
  agentConversationsApi,
  agentRunsApi,
  ApiError,
} from "@/components/agents/api";
import { RunStatusBadge } from "@/components/agents/run-status-badge";
import { AgentSectionActions } from "@/components/agents/agent-section-actions";

const POLL_MS = 3_000;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

interface ChatsViewProps {
  conversations: AgentConversationSummary[];
  selected: AgentConversationDetail | null;
  agents: AgentSummary[];
  initialAgentId?: string;
}

interface SourceView {
  noteId: string;
  title: string;
  available: boolean;
}

function sourcesFrom(value: unknown): SourceView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source) => {
    if (
      typeof source !== "object" ||
      source === null ||
      !("noteId" in source) ||
      !("title" in source) ||
      typeof source.noteId !== "string" ||
      typeof source.title !== "string"
    ) {
      return [];
    }
    return [
      {
        noteId: source.noteId,
        title: source.title,
        available: "available" in source && source.available === true,
      },
    ];
  });
}

export function ChatsView({
  conversations,
  selected: initialSelected,
  agents,
  initialAgentId,
}: ChatsViewProps) {
  const t = useTranslations("agents");
  const router = useRouter();
  const activeAgents = agents.filter((agent) => agent.isActive);
  const [selected, setSelected] = useState(initialSelected);
  const [message, setMessage] = useState("");
  const [agentId, setAgentId] = useState(
    initialAgentId && activeAgents.some((agent) => agent.id === initialAgentId)
      ? initialAgentId
      : (activeAgents[0]?.id ?? ""),
  );
  const [sending, setSending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(initialSelected?.title ?? "");
  const [reassignAgentId, setReassignAgentId] = useState(
    initialSelected?.agentId ?? "",
  );
  const [pendingDowngrade, setPendingDowngrade] = useState<AgentScope[] | null>(
    null,
  );

  const activeRun = useMemo(
    () => selected?.runs.find((run) => !TERMINAL.has(run.status)) ?? null,
    [selected],
  );

  useEffect(() => {
    if (!selected || !activeRun) return;
    const timer = setInterval(() => {
      agentConversationsApi
        .get(selected.id)
        .then(setSelected)
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeRun, selected]);

  async function submitMessage() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (selected) {
        await agentConversationsApi.send(selected.id, trimmed);
        setSelected(await agentConversationsApi.get(selected.id));
      } else {
        const created = await agentConversationsApi.create(agentId, trimmed);
        router.push(`/agents/chats/${created.conversationId}`);
      }
      setMessage("");
      toast.success(t("chatMessageQueuedToast"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("chatSendError"),
      );
    } finally {
      setSending(false);
    }
  }

  async function saveConversation(acknowledgeScopeDowngrade = false) {
    if (!selected) return;
    try {
      const updated = await agentConversationsApi.update(selected.id, {
        title: title.trim(),
        ...(reassignAgentId !== selected.agentId
          ? { agentId: reassignAgentId, acknowledgeScopeDowngrade }
          : {}),
      });
      setSelected(updated);
      setEditOpen(false);
      setPendingDowngrade(null);
      toast.success(t("chatUpdatedToast"));
      router.refresh();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "AGENT_SCOPE_DOWNGRADE_CONFIRMATION_REQUIRED"
      ) {
        setPendingDowngrade(error.missingScopes ?? []);
        return;
      }
      toast.error(
        error instanceof ApiError ? error.message : t("chatUpdateError"),
      );
    }
  }

  async function toggleArchive() {
    if (!selected) return;
    try {
      const updated = await agentConversationsApi.update(selected.id, {
        archived: selected.archivedAt === null,
      });
      setSelected(updated);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("chatUpdateError"),
      );
    }
  }

  async function removeConversation() {
    if (!selected) return;
    try {
      await agentConversationsApi.remove(selected.id);
      router.push("/agents");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("chatDeleteError"),
      );
    }
  }

  async function cancelActiveRun() {
    if (!activeRun) return;
    try {
      await agentRunsApi.cancel(activeRun.id);
      if (selected) setSelected(await agentConversationsApi.get(selected.id));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("cancelRunError"),
      );
    }
  }

  return (
    <>
      <PageHeader
        back={
          selected ? { href: "/agents", label: t("chatsTitle") } : undefined
        }
        title={t("chatsTitle")}
        description={t("chatsDescription")}
        actions={
          <AgentSectionActions current="chats">
            <Button render={<Link href="/agents" />} nativeButton={false}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("newChatButton")}
            </Button>
          </AgentSectionActions>
        }
      />
      <PageBody>
        <div className="grid min-h-[calc(100vh-11rem)] overflow-hidden rounded-xl border lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="border-b bg-muted/30 lg:border-r lg:border-b-0">
            <div className="border-b px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("conversationListLabel")}
            </div>
            <nav className="max-h-72 overflow-y-auto p-2 lg:max-h-[calc(100vh-14rem)]">
              {conversations.length === 0 ? (
                <p className="px-2 py-6 text-sm text-muted-foreground">
                  {t("noChatsDescription")}
                </p>
              ) : (
                conversations.map((conversation) => (
                  <Link
                    key={conversation.id}
                    href={`/agents/chats/${conversation.id}`}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      selected?.id === conversation.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {conversation.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {conversation.agentName ?? t("agentDeletedLabel")}
                    </span>
                  </Link>
                ))
              )}
            </nav>
          </aside>

          <section className="flex min-w-0 flex-col">
            {selected ? (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading font-semibold">
                      {selected.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.agentName ?? t("agentDeletedLabel")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditOpen(true)}
                    >
                      {t("chatSettingsButton")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={toggleArchive}>
                      {selected.archivedAt
                        ? t("unarchiveChatButton")
                        : t("archiveChatButton")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                    >
                      {t("deleteAction")}
                    </Button>
                  </div>
                </header>
                <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-6">
                  {selected.runs.map((run) => {
                    const sources = sourcesFrom(run.ragSources);
                    return (
                      <article key={run.id} className="flex flex-col gap-3">
                        <div className="ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                          <p className="whitespace-pre-wrap">{run.input}</p>
                        </div>
                        <div className="max-w-[92%] rounded-xl border bg-card px-3 py-3 text-sm">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <RunStatusBadge status={run.status} />
                            {run.ragMode ? (
                              <Badge
                                variant={
                                  run.ragMode === "HYBRID"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {run.ragMode === "HYBRID"
                                  ? t("ragHybrid")
                                  : t("ragFullTextOnly")}
                              </Badge>
                            ) : null}
                          </div>
                          {run.summary ? (
                            <p className="whitespace-pre-wrap">{run.summary}</p>
                          ) : run.lastError ? (
                            <p className="text-destructive whitespace-pre-wrap">
                              {run.lastError}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              {t("chatThinking")}
                            </p>
                          )}
                          {sources.length > 0 ? (
                            <div className="mt-3 border-t pt-3">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                {t("ragSourcesTitle")}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {sources.map((source) =>
                                  source.available ? (
                                    <Button
                                      key={source.noteId}
                                      render={
                                        <Link
                                          href={`/notes/${source.noteId}`}
                                        />
                                      }
                                      nativeButton={false}
                                      variant="outline"
                                      size="xs"
                                    >
                                      {source.title}
                                    </Button>
                                  ) : (
                                    <Badge
                                      key={source.noteId}
                                      variant="secondary"
                                    >
                                      {source.title} · {t("sourceUnavailable")}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : null}
                          {run.steps.length > 0 ? (
                            <details className="mt-3 border-t pt-3">
                              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                                {t("toolActivityTitle", {
                                  count: run.steps.length,
                                })}
                              </summary>
                              <ol className="mt-2 flex flex-col gap-2">
                                {run.steps.map((step) => (
                                  <li
                                    key={step.id}
                                    className="rounded-lg bg-muted px-2 py-1.5 text-xs"
                                  >
                                    <span className="font-medium">
                                      {step.toolName ?? t("stepModelCall")}
                                    </span>
                                    {step.resultText ? (
                                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                                        {step.resultText}
                                      </p>
                                    ) : null}
                                  </li>
                                ))}
                              </ol>
                            </details>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  icon="ri-message-2-line"
                  title={t("newChatTitle")}
                  description={t("newChatDescription")}
                />
              </div>
            )}

            <div className="border-t bg-card p-4">
              {!selected ? (
                <div className="mb-3 max-w-sm">
                  <Select
                    value={agentId}
                    onValueChange={(value) => setAgentId(value as string)}
                    items={Object.fromEntries(
                      activeAgents.map((agent) => [agent.id, agent.name]),
                    )}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={t("selectAgentLabel")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {activeAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-label={t("chatComposerLabel")}
                  placeholder={t("chatComposerPlaceholder")}
                  disabled={
                    sending ||
                    Boolean(activeRun) ||
                    Boolean(selected?.archivedAt) ||
                    Boolean(selected && !selected.agentId)
                  }
                  className="max-h-48 min-h-20"
                />
                {activeRun ? (
                  <Button variant="outline" onClick={cancelActiveRun}>
                    {t("cancelRunButton")}
                  </Button>
                ) : (
                  <Button
                    onClick={submitMessage}
                    disabled={
                      !message.trim() || sending || (!selected && !agentId)
                    }
                  >
                    <Icon name="ri-send-plane-2-line" aria-hidden />
                    <span className="sr-only">{t("sendMessageButton")}</span>
                  </Button>
                )}
              </div>
              {selected?.archivedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("archivedChatHint")}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </PageBody>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("chatSettingsTitle")}</DialogTitle>
            <DialogDescription>
              {t("chatSettingsDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label={t("chatTitleLabel")}
            />
            <Select
              value={reassignAgentId}
              onValueChange={(value) => setReassignAgentId(value as string)}
              items={Object.fromEntries(
                activeAgents.map((agent) => [agent.id, agent.name]),
              )}
            >
              <SelectTrigger
                className="w-full"
                aria-label={t("selectAgentLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {activeAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter showCloseButton>
            <Button
              onClick={() => saveConversation()}
              disabled={!title.trim() || !reassignAgentId}
            >
              {t("saveChangesButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDowngrade !== null}
        onOpenChange={(open) => !open && setPendingDowngrade(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scopeDowngradeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("scopeDowngradeDescription", {
                scopes: pendingDowngrade?.join(", ") ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveConversation(true)}>
              {t("confirmReassignButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteChatDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={removeConversation}
            >
              {t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
