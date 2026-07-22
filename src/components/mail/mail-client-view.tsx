"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { MailAccountDialog } from "@/components/settings/mail-account-dialog";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { matchesMailFilter } from "@/lib/mail-filter-matcher";
import {
  ApiError,
  assignMailLabel,
  deleteMailItem,
  fetchFolders,
  fetchMail,
  fetchMailAccounts,
  fetchMailById,
  fetchMailFilterRun,
  fetchMailLabels,
  moveMailItem,
  patchMailItem,
  removeMailLabel,
  syncAccount,
  SYNC_IN_PROGRESS,
  type MailAccountDto,
  type MailDetailDto,
  type MailFolderDto,
  type MailFilterRuleDto,
  type MailLabelDto,
  type MailListItemDto,
} from "./api";
import { ComposeDialog, type ComposeMode } from "./compose-dialog";
import {
  FilterRuleDialog,
  type FilterRuleSaveResult,
} from "./filter-rule-dialog";
import { FilterRulesDialog } from "./filter-rules-dialog";
import {
  ManageLabelsDialog,
  type ManageLabelsChange,
} from "./manage-labels-dialog";
import { MailSidebar, type MailSidebarProps } from "./mail-sidebar";
import { MessageList } from "./message-list";
import { MessagePane } from "./message-pane";

function sortAppliedLabels(
  applied: MailLabelDto[],
  workspaceLabels: MailLabelDto[],
): MailLabelDto[] {
  const order = new Map(
    workspaceLabels.map((label, index) => [label.id, label.position ?? index]),
  );
  return [...applied].sort((left, right) => {
    const positionDelta =
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    return positionDelta || left.id.localeCompare(right.id);
  });
}

const FILTER_RUN_REFRESH_INTERVAL_MS = 2_000;
const FILTER_RUN_REFRESH_MAX_POLLS = 60;

function applyRuleLabel<T extends MailListItemDto | MailDetailDto>(
  mail: T,
  rule: MailFilterRuleDto,
  workspaceLabels: MailLabelDto[],
): T {
  if (
    mail.accountId !== rule.accountId ||
    mail.labels.some((label) => label.id === rule.labelId) ||
    !matchesMailFilter(rule, {
      fromAddress: mail.from,
      subject: mail.subject,
    })
  ) {
    return mail;
  }

  const label = workspaceLabels.find((item) => item.id === rule.labelId) ?? {
    id: rule.labelId,
    ...rule.label,
  };
  return {
    ...mail,
    labels: sortAppliedLabels([...mail.labels, label], workspaceLabels),
  };
}

// Three-pane mail client (plan §5): sidebar (accounts + folders) / message
// list / reading pane. Owns all fetch state; the panes are presentational.
// Desktop (lg+) shows all three columns; below lg the list and the detail
// swap in place and the sidebar lives in a Sheet.
export interface MailClientViewProps {
  workspaceId: string;
  mailLabelsEnabled?: boolean;
  canManageRules?: boolean;
}

export function MailClientView({ workspaceId, ...props }: MailClientViewProps) {
  return <MailClientCoordinator key={workspaceId} {...props} />;
}

type MailClientCoordinatorProps = Omit<MailClientViewProps, "workspaceId">;

function MailClientCoordinator({
  mailLabelsEnabled = false,
  canManageRules = false,
}: MailClientCoordinatorProps) {
  const t = useTranslations("mail");
  const [accounts, setAccounts] = useState<MailAccountDto[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsReload, setAccountsReload] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  const [folders, setFolders] = useState<MailFolderDto[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [foldersReload, setFoldersReload] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [labels, setLabels] = useState<MailLabelDto[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(mailLabelsEnabled);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [labelsReload, setLabelsReload] = useState(0);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const [items, setItems] = useState<MailListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReload, setListReload] = useState(0);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<MailDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  const [syncing, setSyncing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [filterRuleOpen, setFilterRuleOpen] = useState(false);
  const [pendingFilterRunId, setPendingFilterRunId] = useState<string | null>(
    null,
  );
  const filterRuleTriggerRef = useRef<HTMLButtonElement>(null);
  const [filterRulesOpen, setFilterRulesOpen] = useState(false);
  const filterRulesTriggerRef = useRef<HTMLButtonElement>(null);
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  const manageLabelsTriggerRef = useRef<HTMLButtonElement>(null);
  const [pendingLabelIds, setPendingLabelIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [labelMutationError, setLabelMutationError] = useState<string | null>(
    null,
  );
  const [compose, setCompose] = useState<{
    mode: ComposeMode;
    original: MailDetailDto | null;
    accountId: string;
  } | null>(null);

  useEffect(() => {
    if (!pendingFilterRunId) return;
    const runId = pendingFilterRunId;

    let cancelled = false;
    let pollCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function reconcileMail() {
      setPendingFilterRunId(null);
      setLabelsReload((value) => value + 1);
      setListReload((value) => value + 1);
      setDetailReload((value) => value + 1);
    }

    async function poll() {
      if (cancelled) return;
      pollCount += 1;
      try {
        const run = await fetchMailFilterRun(runId);
        if (cancelled) return;
        if (run.status === "COMPLETED" || run.status === "FAILED") {
          reconcileMail();
          return;
        }
      } catch {
        // Transient polling failures retry within the same bounded window.
      }

      if (pollCount >= FILTER_RUN_REFRESH_MAX_POLLS) {
        reconcileMail();
        return;
      }
      timer = setTimeout(poll, FILTER_RUN_REFRESH_INTERVAL_MS);
    }

    timer = setTimeout(poll, FILTER_RUN_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingFilterRunId]);

  // Accounts: loaded on mount; the first IMAP account is preselected, the
  // system webhook mailbox is the fallback when no IMAP account exists.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setAccountsError(null);
      try {
        const list = await fetchMailAccounts();
        if (cancelled) return;
        setAccounts(list);
        setSelectedAccountId((prev) => {
          if (prev && list.some((account) => account.id === prev)) return prev;
          const imap = list.find((account) => account.kind !== "WEBHOOK");
          return (imap ?? list[0])?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setAccountsError(t("errorLoadAccounts"));
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [accountsReload, t]);

  useEffect(() => {
    if (!mailLabelsEnabled) return;
    if (accounts === null) return;
    if (accounts.length > 0 && !selectedAccountId) return;
    if (selectedAccountId && !selectedFolderId) return;
    let cancelled = false;
    async function run() {
      setLabelsLoading(true);
      setLabelsError(null);
      try {
        const list = await fetchMailLabels(
          selectedAccountId && selectedFolderId
            ? {
                accountId: selectedAccountId,
                folderId: selectedFolderId,
              }
            : undefined,
        );
        if (!cancelled) setLabels(list);
      } catch {
        if (!cancelled) setLabelsError(t("errorLoadLabels"));
      } finally {
        if (!cancelled) setLabelsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    accounts,
    labelsReload,
    mailLabelsEnabled,
    selectedAccountId,
    selectedFolderId,
    t,
  ]);

  // Folders per selected account; the account's INBOX becomes the default
  // folder selection.
  useEffect(() => {
    if (!selectedAccountId) return;
    const accountId = selectedAccountId;
    let cancelled = false;
    async function run() {
      setFoldersLoading(true);
      setFoldersError(null);
      try {
        const list = await fetchFolders(accountId);
        if (cancelled) return;
        setFolders(list);
        setSelectedFolderId((prev) => {
          if (prev && list.some((folder) => folder.id === prev)) return prev;
          const inbox = list.find((folder) => folder.specialUse === "INBOX");
          return (inbox ?? list[0])?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setFoldersError(t("errorLoadFolders"));
        }
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, foldersReload, t]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const currentCursor = pageCursors[pageIndex];

  // Message list for the current account/folder/filters. Data fetch runs
  // from a locally-defined async function rather than directly in the effect
  // body, so the loading/error resets aren't flagged as a synchronous
  // setState-in-effect (react-hooks/set-state-in-effect) — matches
  // src/components/messages/messages-view.tsx.
  useEffect(() => {
    if (!selectedAccountId || !selectedFolderId) return;
    const accountId = selectedAccountId;
    const folderId = selectedFolderId;
    let cancelled = false;
    async function run() {
      setListLoading(true);
      setListError(null);
      try {
        const result = await fetchMail({
          accountId,
          folderId,
          labelId: selectedLabelId ?? undefined,
          unread: unreadOnly || undefined,
          query: query || undefined,
          sort,
          cursor: currentCursor,
        });
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (!cancelled) {
          setListError(t("errorLoadMessages"));
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    selectedAccountId,
    selectedFolderId,
    selectedLabelId,
    unreadOnly,
    query,
    sort,
    currentCursor,
    listReload,
    t,
  ]);

  // Message detail. Opening an unread message optimistically PATCHes
  // { isRead: true } and refreshes the list row + folder badges; a failed
  // PATCH rolls the optimistic state back with a toast.
  useEffect(() => {
    if (!selectedMessageId) return;
    const messageId = selectedMessageId;
    let cancelled = false;

    function applyRead(isRead: boolean) {
      setDetail((prev) =>
        prev && prev.id === messageId ? { ...prev, isRead } : prev,
      );
      setItems((prev) =>
        prev.map((item) =>
          item.id === messageId ? { ...item, isRead } : item,
        ),
      );
    }

    async function run() {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const result = await fetchMailById(messageId);
        if (cancelled) return;
        setDetail(result);
        if (!result.isRead) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === messageId ? { ...item, isRead: true } : item,
            ),
          );
          setDetail({ ...result, isRead: true });
          try {
            await patchMailItem(messageId, { isRead: true });
            setFoldersReload((n) => n + 1);
          } catch (error) {
            applyRead(false);
            toast.error(
              error instanceof ApiError ? error.message : t("errorMarkRead"),
            );
          }
        }
      } catch {
        if (!cancelled) {
          setDetailError(t("errorLoadMessage"));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedMessageId, detailReload, t]);

  function resetToFirstPage() {
    setPageCursors([undefined]);
    setPageIndex(0);
  }

  function clearSelection() {
    setSelectedMessageId(null);
    setDetail(null);
    setDetailError(null);
    setLabelMutationError(null);
  }

  function handleSelectAccount(id: string) {
    if (id === selectedAccountId) return;
    setSelectedAccountId(id);
    setSelectedFolderId(null);
    setFolders([]);
    setFoldersLoading(true);
    setFoldersError(null);
    setLabelsLoading(true);
    setItems([]);
    setNextCursor(null);
    setListLoading(true);
    setListError(null);
    setFilterRulesOpen(false);
    clearSelection();
    resetToFirstPage();
  }

  function closeMobileNav() {
    setMobileNavOpen(false);
    requestAnimationFrame(() => mobileNavTriggerRef.current?.focus());
  }

  function handleMobileNavOpenChange(open: boolean) {
    if (open) {
      setMobileNavOpen(true);
      return;
    }
    closeMobileNav();
  }

  function handleSelectFolder(id: string) {
    if (id !== selectedFolderId) {
      setSelectedFolderId(id);
      clearSelection();
      resetToFirstPage();
    }
    closeMobileNav();
  }

  function handleSelectLabel(id: string | null) {
    if (id !== selectedLabelId) {
      setSelectedLabelId(id);
      clearSelection();
      resetToFirstPage();
    }
    closeMobileNav();
  }

  function handleSelectMessage(id: string) {
    if (id === selectedMessageId) return;
    setSelectedMessageId(id);
    setDetail(null);
    setDetailError(null);
    setLabelMutationError(null);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    clearSelection();
    resetToFirstPage();
  }

  function handleUnreadOnlyChange(value: boolean) {
    setUnreadOnly(value);
    clearSelection();
    resetToFirstPage();
  }

  function handleSortChange(value: "asc" | "desc") {
    setSort(value);
    clearSelection();
    resetToFirstPage();
  }

  function handleNext() {
    if (!nextCursor) return;
    setPageCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((prev) => prev + 1);
  }

  function handlePrevious() {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }

  async function handleSync() {
    if (!selectedAccountId || syncing) return;
    setSyncing(true);
    try {
      await syncAccount(selectedAccountId);
      toast.success(t("syncCompleteToast"));
      setFoldersReload((n) => n + 1);
      setLabelsReload((n) => n + 1);
      setListReload((n) => n + 1);
    } catch (error) {
      if (error instanceof ApiError && error.message === SYNC_IN_PROGRESS) {
        toast.info(t("syncInProgressToast"));
      } else {
        toast.error(t("errorSyncAccount"));
      }
    } finally {
      setSyncing(false);
    }
  }

  // Remove a row after delete/archive/move: drop it from the list, clear the
  // selection, refresh the folder badges.
  function handleItemRemoved(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    clearSelection();
    setFoldersReload((n) => n + 1);
  }

  async function handleToggleLabel(label: MailLabelDto) {
    if (!detail || pendingLabelIds.has(label.id)) return;
    const messageId = detail.id;
    const wasApplied = detail.labels.some((item) => item.id === label.id);
    setLabelMutationError(null);
    setPendingLabelIds((current) => new Set(current).add(label.id));
    try {
      if (wasApplied) {
        await removeMailLabel(messageId, label.id);
      } else {
        await assignMailLabel(messageId, label.id);
      }
      setLabelsReload((value) => value + 1);

      if (wasApplied && selectedLabelId === label.id) {
        setItems((current) => current.filter((item) => item.id !== messageId));
        clearSelection();
        setListReload((value) => value + 1);
        toast.success(t("labelRemovedToast"));
        return;
      }

      const updateLabels = (current: MailLabelDto[]) =>
        wasApplied
          ? current.filter((item) => item.id !== label.id)
          : sortAppliedLabels(
              current.some((item) => item.id === label.id)
                ? current
                : [...current, label],
              labels,
            );
      setDetail((current) =>
        current?.id === messageId
          ? { ...current, labels: updateLabels(current.labels) }
          : current,
      );
      setItems((current) =>
        current.map((item) =>
          item.id === messageId
            ? { ...item, labels: updateLabels(item.labels) }
            : item,
        ),
      );
      toast.success(
        wasApplied ? t("labelRemovedToast") : t("labelAssignedToast"),
      );
    } catch (error) {
      const message =
        error instanceof ApiError && error.message === "RESOURCE_NOT_FOUND"
          ? t("errorLabelResourceNotFound")
          : t("errorUpdateMessageLabels");
      setLabelMutationError(message);
      toast.error(message);
    } finally {
      setPendingLabelIds((current) => {
        const next = new Set(current);
        next.delete(label.id);
        return next;
      });
    }
  }

  async function handleToggleRead() {
    if (!detail) return;
    const id = detail.id;
    const nextRead = !detail.isRead;
    setDetail((prev) =>
      prev && prev.id === id ? { ...prev, isRead: nextRead } : prev,
    );
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isRead: nextRead } : item,
      ),
    );
    try {
      await patchMailItem(id, { isRead: nextRead });
      setFoldersReload((n) => n + 1);
    } catch (error) {
      setDetail((prev) =>
        prev && prev.id === id ? { ...prev, isRead: !nextRead } : prev,
      );
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isRead: !nextRead } : item,
        ),
      );
      toast.error(
        error instanceof ApiError ? error.message : t("errorToggleRead"),
      );
    }
  }

  async function handleDelete() {
    if (!detail) return;
    try {
      const { status } = await deleteMailItem(detail.id);
      toast.success(
        status === "trashed" ? t("itemTrashedToast") : t("itemDeletedToast"),
      );
      handleItemRemoved(detail.id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("errorDeleteItem"),
      );
    }
  }

  const archiveFolder =
    folders.find((folder) => folder.specialUse === "ARCHIVE") ?? null;

  async function handleArchive() {
    if (!detail || !archiveFolder) return;
    try {
      await moveMailItem(detail.id, archiveFolder.id);
      toast.success(t("itemArchivedToast"));
      handleItemRemoved(detail.id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("errorArchiveItem"),
      );
    }
  }

  const selectedAccount =
    accounts?.find((account) => account.id === selectedAccountId) ?? null;
  const hasActiveFilters =
    query !== "" || unreadOnly || selectedLabelId !== null;

  // Compose sends from the selected IMAP account, falling back to the first
  // IMAP account when the webhook mailbox is selected; without any IMAP
  // account the button stays disabled.
  const composeAccountId =
    selectedAccount && selectedAccount.kind !== "WEBHOOK"
      ? selectedAccount.id
      : (accounts?.find((account) => account.kind !== "WEBHOOK")?.id ?? null);

  function openCompose(mode: ComposeMode, original: MailDetailDto | null) {
    if (!composeAccountId) return;
    // Reply/forward always go through the original's own account.
    setCompose({
      mode,
      original,
      accountId: original?.accountId ?? composeAccountId,
    });
  }

  const selectedFolder =
    folders.find((folder) => folder.id === selectedFolderId) ?? null;

  function handleSent() {
    // A local Sent row appears right after send — refresh the list when the
    // user is looking at the Sent folder.
    if (selectedFolder?.specialUse === "SENT") {
      setListReload((n) => n + 1);
    }
  }

  function handleFilterRuleOpenChange(open: boolean) {
    setFilterRuleOpen(open);
    if (!open) {
      requestAnimationFrame(() => filterRuleTriggerRef.current?.focus());
    }
  }

  function handleFilterRuleSaved({
    rule,
    applyToExistingMail,
  }: FilterRuleSaveResult) {
    handleFilterRuleOpenChange(false);
    setLabelsReload((value) => value + 1);

    if (!applyToExistingMail) {
      setListReload((value) => value + 1);
      setDetailReload((value) => value + 1);
      return;
    }

    setItems((current) =>
      current.map((item) => applyRuleLabel(item, rule, labels)),
    );
    setDetail((current) =>
      current ? applyRuleLabel(current, rule, labels) : current,
    );

    const run = rule.latestRun;
    if (run?.status === "PENDING" || run?.status === "RUNNING") {
      setPendingFilterRunId(run.id);
    } else {
      setListReload((value) => value + 1);
      setDetailReload((value) => value + 1);
    }
  }

  function handleFilterRulesOpenChange(open: boolean) {
    setFilterRulesOpen(open);
    if (!open) {
      requestAnimationFrame(() => filterRulesTriggerRef.current?.focus());
    }
  }

  function handleFilterRulesChanged() {
    setLabelsReload((value) => value + 1);
    setListReload((value) => value + 1);
    if (selectedMessageId) setDetailReload((value) => value + 1);
  }

  function handleManageLabelsOpenChange(open: boolean) {
    setManageLabelsOpen(open);
    if (!open) {
      requestAnimationFrame(() => manageLabelsTriggerRef.current?.focus());
    }
  }

  function handleLabelsChanged(change?: ManageLabelsChange) {
    if (change?.deletedId && selectedLabelId === change.deletedId) {
      setSelectedLabelId(null);
      clearSelection();
      resetToFirstPage();
    }
    setLabelsReload((value) => value + 1);
    setListReload((value) => value + 1);
    if (selectedMessageId) setDetailReload((value) => value + 1);
  }

  const headerActions = (
    <>
      {mailLabelsEnabled && canManageRules && (
        <>
          <Button
            ref={manageLabelsTriggerRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setManageLabelsOpen(true)}
          >
            <Icon
              name="ri-price-tag-3-line"
              aria-hidden
              data-icon="inline-start"
            />
            {t("manageLabelsButton")}
          </Button>
          <Button
            ref={filterRulesTriggerRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedAccount}
            onClick={() => setFilterRulesOpen(true)}
          >
            <Icon
              name="ri-filter-settings-line"
              aria-hidden
              data-icon="inline-start"
            />
            {t("manageFilterRulesButton")}
          </Button>
        </>
      )}
      <Button size="sm" onClick={() => setAddAccountOpen(true)}>
        <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
        {t("addAccountButton")}
      </Button>
    </>
  );

  const addAccountDialog = addAccountOpen ? (
    <MailAccountDialog
      open
      onOpenChange={setAddAccountOpen}
      mode="create"
      existing={null}
      onSaved={() => setAccountsReload((n) => n + 1)}
    />
  ) : null;

  const sidebarProps: MailSidebarProps = {
    accounts: accounts ?? [],
    selectedAccountId,
    onSelectAccount: handleSelectAccount,
    folders,
    foldersLoading,
    foldersError,
    onRetryFolders: () => setFoldersReload((n) => n + 1),
    selectedFolderId,
    onSelectFolder: handleSelectFolder,
    mailLabelsEnabled,
    labels,
    labelsLoading,
    labelsError,
    onRetryLabels: () => setLabelsReload((value) => value + 1),
    selectedLabelId,
    onSelectLabel: handleSelectLabel,
    onSync: handleSync,
    syncing,
    onCompose: composeAccountId ? () => openCompose("new", null) : null,
  };

  // The archive action hides when the account has no ARCHIVE folder or the
  // message already sits in it; deleting from TRASH is permanent (confirm).
  const detailFolder = detail
    ? (folders.find((folder) => folder.id === detail.folderId) ?? null)
    : null;
  const canArchive = Boolean(
    detail && archiveFolder && detail.folderId !== archiveFolder.id,
  );
  const isInTrash = detailFolder?.specialUse === "TRASH";

  // Initial accounts load — full-layout skeleton.
  if (accounts === null && !accountsError) {
    return (
      <PageBody fullBleed>
        <div className="shrink-0 border-b border-background-200 px-6 pt-6 pb-4">
          <PageHeader title={t("pageTitle")} actions={headerActions} />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-[220px] shrink-0 flex-col gap-2 border-r border-background-200 bg-background-50 p-3 lg:flex">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            {[1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </div>
          <div className="flex w-full flex-col border-r border-background-200 bg-background-50 lg:w-[420px] lg:shrink-0">
            <div className="space-y-2 border-b border-background-100 p-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-b border-background-100 px-4 py-3"
              >
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full max-w-56" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden flex-1 items-center justify-center bg-background-50 p-8 lg:flex">
            <p className="animate-pulse text-sm text-foreground-400">
              {t("loadingLabel")}
            </p>
          </div>
        </div>
        {addAccountDialog}
      </PageBody>
    );
  }

  if (accountsError) {
    return (
      <PageBody fullBleed>
        <div className="shrink-0 border-b border-background-200 px-6 pt-6 pb-4">
          <PageHeader title={t("pageTitle")} actions={headerActions} />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            bordered={false}
            tone="danger"
            icon="ri-mail-warning-line"
            title={t("errorLoadMailTitle")}
            description={accountsError}
            className="max-w-sm"
            action={
              <Button
                type="button"
                onClick={() => setAccountsReload((n) => n + 1)}
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
        </div>
        {addAccountDialog}
      </PageBody>
    );
  }

  return (
    <PageBody fullBleed>
      <div className="shrink-0 border-b border-background-200 px-6 pt-6 pb-4">
        <PageHeader title={t("pageTitle")} actions={headerActions} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar: persistent rail from lg upward, Sheet below. */}
        <div className="hidden w-[220px] shrink-0 border-r border-background-200 bg-background-50 lg:flex lg:flex-col">
          <MailSidebar {...sidebarProps} />
        </div>

        {/* Message list; on mobile it swaps in place with the detail pane. */}
        <div
          className={cn(
            "w-full min-w-0 flex-col border-r border-background-200 bg-background-50 lg:flex lg:w-[420px] lg:shrink-0",
            selectedMessageId ? "hidden lg:flex" : "flex",
          )}
        >
          <MessageList
            items={items}
            loading={listLoading}
            error={listError}
            onRetry={() => setListReload((n) => n + 1)}
            selectedMessageId={selectedMessageId}
            onSelectMessage={handleSelectMessage}
            searchInput={searchInput}
            onSearchChange={handleSearchChange}
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={handleUnreadOnlyChange}
            sort={sort}
            onSortChange={handleSortChange}
            page={pageIndex + 1}
            hasPrevious={pageIndex > 0}
            hasNext={Boolean(nextCursor)}
            onPrevious={handlePrevious}
            onNext={handleNext}
            hasActiveFilters={hasActiveFilters}
            isWebhookAccount={selectedAccount?.kind === "WEBHOOK"}
            onOpenSidebar={() => setMobileNavOpen(true)}
            sidebarTriggerRef={mobileNavTriggerRef}
          />
        </div>

        {/* Reading pane. */}
        <div
          className={cn(
            "min-w-0 flex-1 flex-col bg-background-50",
            selectedMessageId ? "flex" : "hidden lg:flex",
          )}
        >
          <MessagePane
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={() => setDetailReload((n) => n + 1)}
            hasSelection={Boolean(selectedMessageId)}
            onBack={clearSelection}
            onReply={() => openCompose("reply", detail)}
            onForward={() => openCompose("forward", detail)}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onToggleRead={handleToggleRead}
            canArchive={canArchive}
            isInTrash={isInTrash}
            mailLabelsEnabled={mailLabelsEnabled}
            labels={labels}
            labelsLoading={labelsLoading}
            labelsError={labelsError}
            pendingLabelIds={pendingLabelIds}
            labelMutationError={labelMutationError}
            onRetryLabels={() => setLabelsReload((value) => value + 1)}
            onToggleLabel={handleToggleLabel}
            canCreateFilter={mailLabelsEnabled && canManageRules}
            onCreateFilter={() => setFilterRuleOpen(true)}
            filterTriggerRef={filterRuleTriggerRef}
          />
        </div>
      </div>

      {compose && (
        <ComposeDialog
          open
          onOpenChange={(open) => {
            if (!open) setCompose(null);
          }}
          mode={compose.mode}
          original={compose.original}
          accountId={compose.accountId}
          onSent={handleSent}
        />
      )}

      {filterRuleOpen && detail && selectedAccount && (
        <FilterRuleDialog
          open
          onOpenChange={handleFilterRuleOpenChange}
          detail={detail}
          accountName={selectedAccount.name}
          onSaved={handleFilterRuleSaved}
        />
      )}

      {filterRulesOpen && selectedAccount && (
        <FilterRulesDialog
          open
          onOpenChange={handleFilterRulesOpenChange}
          accountId={selectedAccount.id}
          accountName={selectedAccount.name}
          onRulesChanged={handleFilterRulesChanged}
        />
      )}

      {manageLabelsOpen && (
        <ManageLabelsDialog
          open
          onOpenChange={handleManageLabelsOpenChange}
          labels={labels}
          loading={labelsLoading}
          error={labelsError}
          onRetry={() => setLabelsReload((value) => value + 1)}
          onChanged={handleLabelsChanged}
        />
      )}

      {addAccountDialog}

      <Sheet open={mobileNavOpen} onOpenChange={handleMobileNavOpenChange}>
        <SheetContent side="left" className="w-72 max-w-[calc(100vw-2rem)] p-0">
          <SheetHeader className="border-b border-background-100">
            <SheetTitle>{t("accountsAndFoldersLabel")}</SheetTitle>
          </SheetHeader>
          <MailSidebar {...sidebarProps} />
        </SheetContent>
      </Sheet>
    </PageBody>
  );
}
