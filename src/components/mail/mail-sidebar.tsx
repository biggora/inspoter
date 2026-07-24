"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { MailAccountDto, MailFolderDto, MailLabelDto } from "./api";
import { LabelChip } from "./label-chip";

type Translate = (key: string, params?: Record<string, string>) => string;

const SPECIAL_USE_NAME_KEYS: Partial<
  Record<MailFolderDto["specialUse"], string>
> = {
  INBOX: "folderNameInbox",
  SENT: "folderNameSent",
  DRAFTS: "folderNameDrafts",
  TRASH: "folderNameTrash",
  JUNK: "folderNameJunk",
  ARCHIVE: "folderNameArchive",
};

const SPECIAL_USE_ICONS: Partial<Record<MailFolderDto["specialUse"], string>> =
  {
    INBOX: "ri-inbox-line",
    SENT: "ri-send-plane-line",
    DRAFTS: "ri-draft-line",
    TRASH: "ri-delete-bin-line",
    JUNK: "ri-spam-line",
    ARCHIVE: "ri-archive-line",
  };

export function folderDisplayName(folder: MailFolderDto, t: Translate): string {
  const key = SPECIAL_USE_NAME_KEYS[folder.specialUse];
  return key ? t(key) : folder.name;
}

// Sync status dot next to the account name: animated while syncing, red on
// error (with the error text in the tooltip). Idle accounts show nothing.
// role="img" + aria-label so screen readers announce sync state, not just color.
function SyncStatusDot({ account }: { account: MailAccountDto }) {
  const t = useTranslations("mail");
  if (account.syncStatus === "SYNCING") {
    return (
      <span
        role="img"
        aria-label={t("syncStatusSyncingLabel")}
        className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--info-text)]"
        title={t("syncStatusSyncingTitle")}
      />
    );
  }
  if (account.syncStatus === "ERROR") {
    const errorText = account.syncError ?? t("syncStatusErrorFallback");
    return (
      <span
        role="img"
        aria-label={t("syncStatusErrorAriaLabel", { error: errorText })}
        className="size-2 shrink-0 rounded-full bg-[var(--error-text)]"
        title={errorText}
      />
    );
  }
  return null;
}

export interface MailSidebarProps {
  accounts: MailAccountDto[];
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
  folders: MailFolderDto[];
  foldersLoading: boolean;
  foldersError: string | null;
  onRetryFolders: () => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  labels: MailLabelDto[];
  labelsLoading: boolean;
  labelsError: string | null;
  onRetryLabels: () => void;
  selectedLabelId: string | null;
  onSelectLabel: (id: string | null) => void;
  onSync: () => void;
  syncing: boolean;
  /** null while no IMAP account exists — compose stays disabled. */
  onCompose: (() => void) | null;
}

// Account switcher + folder list + sync/compose actions (plan §5). Rendered
// both in the persistent desktop rail (lg+) and inside the mobile Sheet.
export function MailSidebar({
  accounts,
  selectedAccountId,
  onSelectAccount,
  folders,
  foldersLoading,
  foldersError,
  onRetryFolders,
  selectedFolderId,
  onSelectFolder,
  labels,
  labelsLoading,
  labelsError,
  onRetryLabels,
  selectedLabelId,
  onSelectLabel,
  onSync,
  syncing,
  onCompose,
}: MailSidebarProps) {
  const t = useTranslations("mail");
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-background-100 p-3">
        {/* Compose needs an IMAP account with SMTP transport — the webhook
            mailbox is inbound-only. */}
        <Button
          type="button"
          className="w-full"
          disabled={!onCompose}
          title={onCompose ? undefined : t("composeDisabledTitle")}
          onClick={onCompose ?? undefined}
        >
          <Icon name="ri-quill-pen-line" aria-hidden data-icon="inline-start" />
          {t("composeButton")}
        </Button>

        <Select
          value={selectedAccountId ?? ""}
          onValueChange={(value) => value && onSelectAccount(value as string)}
          items={Object.fromEntries(
            accounts.map((account) => [account.id, account.name]),
          )}
        >
          <SelectTrigger
            className="w-full"
            aria-label={t("accountSelectAriaLabel")}
          >
            <SelectValue placeholder={t("accountSelectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <SyncStatusDot account={account} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{account.name}</span>
                      {account.email && (
                        <span className="truncate text-xs text-muted-foreground">
                          {account.email}
                        </span>
                      )}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {selectedAccount && (
          <div className="flex min-w-0 items-center gap-1.5 px-0.5">
            <SyncStatusDot account={selectedAccount} />
            <span
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              title={selectedAccount.email || selectedAccount.name}
            >
              {selectedAccount.email || selectedAccount.name}
            </span>
            {selectedAccount.kind === "WEBHOOK" && (
              <Badge variant="secondary">{t("webhookAccountBadge")}</Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <nav aria-label={t("foldersNavLabel")} className="space-y-0.5">
          {foldersLoading ? (
            <div className="space-y-1.5 p-1">
              {[1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          ) : foldersError ? (
            <EmptyState
              size="xs"
              align="start"
              bordered={false}
              description={foldersError}
              className="px-2 py-4"
              action={
                <Button type="button" size="sm" onClick={onRetryFolders}>
                  <Icon
                    name="ri-refresh-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("retryButton")}
                </Button>
              }
            />
          ) : folders.length === 0 ? (
            <EmptyState
              size="xs"
              align="start"
              bordered={false}
              description={t("foldersEmptyDescription")}
              className="px-2 py-4"
            />
          ) : (
            folders.map((folder) => {
              const iconClass =
                SPECIAL_USE_ICONS[folder.specialUse] ?? "ri-folder-line";
              const isSelected = folder.id === selectedFolderId;
              return (
                <Button
                  key={folder.id}
                  type="button"
                  variant={isSelected ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onSelectFolder(folder.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className="w-full justify-start"
                >
                  <Icon name={iconClass} aria-hidden data-icon="inline-start" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {folderDisplayName(folder, t)}
                  </span>
                  {folder.unreadCount > 0 && (
                    <Badge
                      aria-label={t("folderUnreadAriaLabel", {
                        count: folder.unreadCount,
                      })}
                    >
                      {folder.unreadCount}
                    </Badge>
                  )}
                </Button>
              );
            })
          )}
        </nav>

        <nav
          aria-label={t("labelsNavLabel")}
          className="mt-3 space-y-0.5 border-t border-background-100 pt-3"
        >
          <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-foreground-500 uppercase">
            {t("labelsSectionTitle")}
          </h2>
          <Button
            type="button"
            variant={selectedLabelId === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSelectLabel(null)}
            aria-current={selectedLabelId === null ? "true" : undefined}
            className="w-full justify-start"
          >
            <Icon
              name="ri-price-tag-3-line"
              aria-hidden
              data-icon="inline-start"
            />
            <span className="min-w-0 flex-1 truncate text-left">
              {t("allLabelsButton")}
            </span>
          </Button>

          {labelsLoading ? (
            <div
              className="space-y-1.5 p-1"
              aria-label={t("loadingLabelsLabel")}
            >
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          ) : labelsError ? (
            <EmptyState
              size="xs"
              align="start"
              bordered={false}
              description={labelsError}
              className="px-2 py-3"
              action={
                <Button type="button" size="sm" onClick={onRetryLabels}>
                  <Icon
                    name="ri-refresh-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("retryButton")}
                </Button>
              }
            />
          ) : labels.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("labelsSidebarEmptyDescription")}
            </p>
          ) : (
            labels.map((label) => {
              const isSelected = label.id === selectedLabelId;
              const countDescriptionId = `mail-label-${label.id}-count`;
              return (
                <Fragment key={label.id}>
                  <Button
                    type="button"
                    variant={isSelected ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onSelectLabel(label.id)}
                    aria-current={isSelected ? "true" : undefined}
                    aria-describedby={countDescriptionId}
                    className="w-full justify-start overflow-hidden"
                  >
                    <LabelChip
                      label={label}
                      className="mr-auto max-w-[calc(100%-2.5rem)]"
                    />
                    <Badge
                      variant="outline"
                      aria-hidden
                      className="ml-auto min-w-5 px-1.5 tabular-nums"
                    >
                      {label.messageCount ?? 0}
                    </Badge>
                  </Button>
                  <span id={countDescriptionId} className="sr-only">
                    {t("labelMessageCountAriaLabel", {
                      count: label.messageCount ?? 0,
                    })}
                  </span>
                </Fragment>
              );
            })
          )}
        </nav>
      </div>

      <div className="space-y-0.5 border-t border-background-100 p-2">
        {selectedAccount && selectedAccount.kind !== "WEBHOOK" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={syncing}
            className="w-full justify-start"
          >
            {syncing ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
            )}
            {t("syncButton")}
          </Button>
        )}
        <Button
          render={<Link href="/settings/mail" />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="w-full justify-start"
        >
          <Icon
            name="ri-settings-3-line"
            aria-hidden
            data-icon="inline-start"
          />
          {t("manageAccountsButton")}
        </Button>
      </div>
    </div>
  );
}
