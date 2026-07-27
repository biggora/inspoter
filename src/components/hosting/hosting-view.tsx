"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardGrid } from "@/components/shell/card-grid";
import { Icon } from "@/components/ui/icon";
import { NotificationToast } from "@/components/shell/notification-toast";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { ProviderCredentialDialog } from "@/components/settings/provider-credential-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import { MetricRow, MetricRows } from "@/components/ui/metric-row";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import { UsageMeter } from "@/components/ui/usage-meter";
import {
  StatusIndicator,
  type StatusState,
} from "@/components/ui/status-indicator";
import {
  fetchAccounts,
  getAccount,
  refreshAccounts,
  setSuspended,
  type AccountsByProviderDto,
  type HostingAccountDto,
} from "./api";

type Account = HostingAccountDto & { providerId: string };

type AccountStatus = HostingAccountDto["status"];

interface Notification {
  message: string;
  variant: "success" | "error";
}

type PageState = "loading" | "error" | "empty" | "ready";

// Hosting account states mapped onto the app-wide status vocabulary — the
// indicator supplies colour, wording, and pulse (ui/status-indicator.tsx).
const statusState: Record<string, StatusState> = {
  active: "up",
  suspended: "suspended",
  unknown: "unknown",
};

export function HostingView() {
  const t = useTranslations("hosting");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showNotification = useCallback(
    (message: string, variant: "success" | "error") => {
      setNotification({ message, variant });
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      notificationTimeoutRef.current = setTimeout(
        () => setNotification(null),
        4000,
      );
    },
    [],
  );

  const cardKey = useCallback(
    (account: Pick<Account, "providerId" | "id">) =>
      `${account.providerId}:${account.id}`,
    [],
  );

  // `force` asks the server for a live provider fan-out instead of the cached
  // listing — the Refresh and Retry buttons need it, since a plain fetch would
  // just replay the same snapshot.
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const groups: AccountsByProviderDto[] = force
          ? await refreshAccounts()
          : await fetchAccounts();
        const flat: Account[] = [];
        const errors: string[] = [];
        for (const g of groups) {
          if (g.error) errors.push(`${g.label}: ${g.error}`);
          for (const a of g.accounts)
            flat.push({ ...a, providerId: g.providerId });
        }
        setAccounts(flat);
        setLoadError(errors.length ? errors.join("; ") : null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    load();
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, [load]);

  const handleToggleSuspend = useCallback(
    async (account: Account) => {
      const key = cardKey(account);
      const nextSuspended = account.status !== "suspended";
      setCardErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setBusyIds((prev) => ({ ...prev, [key]: true }));

      try {
        await setSuspended(account.providerId, account.id, nextSuspended);
        const fresh = await getAccount(account.providerId, account.id);
        setAccounts((prev) =>
          prev.map((a) =>
            cardKey(a) === key
              ? { ...fresh, providerId: account.providerId }
              : a,
          ),
        );
        showNotification(
          t(nextSuspended ? "suspendSuccessToast" : "unsuspendSuccessToast", {
            name: account.domain,
          }),
          "success",
        );
      } catch (err) {
        setCardErrors((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : t("actionError"),
        }));
      } finally {
        setBusyIds((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [cardKey, showNotification, t],
  );

  // Only the first load empties the page into a skeleton. A refresh over
  // accounts we already have keeps the cards and dims them instead
  // (design.md §4.4: retain confirmed data while a refresh runs).
  const pageState: PageState =
    loading && accounts.length === 0
      ? "loading"
      : accounts.length === 0 && loadError
        ? "error"
        : accounts.length === 0
          ? "empty"
          : "ready";

  return (
    <PageBody>
      {notification && (
        <NotificationToast
          message={notification.message}
          variant={notification.variant}
        />
      )}

      <PageHeader
        title={t("pageTitle")}
        description={
          pageState === "ready"
            ? t("accountsCount", { count: accounts.length })
            : undefined
        }
        actions={
          <>
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addProviderButton")}
            </Button>
            {pageState !== "loading" ? (
              <Button variant="outline" onClick={reload} disabled={loading}>
                <Icon
                  name="ri-refresh-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("refreshButton")}
              </Button>
            ) : undefined}
          </>
        }
      />

      {pageState === "loading" && (
        <LoadingRegion>
          <CardGridSkeleton metricRows={5} footerActions={0} />
        </LoadingRegion>
      )}

      {pageState === "error" && (
        <EmptyState
          tone="danger"
          icon="ri-cloud-off-line"
          title={t("providerUnavailableTitle")}
          description={t("providerUnavailableDescription")}
          action={
            <Button onClick={reload}>
              <Icon
                name="ri-refresh-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("retryButton")}
            </Button>
          }
        />
      )}

      {pageState === "empty" && (
        <EmptyState
          icon="ri-global-line"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addProviderButton")}
            </Button>
          }
        />
      )}

      {pageState === "ready" && (
        <LoadingOverlay busy={loading}>
          <CardGrid>
            {accounts.map((account) => (
              <HostingCard
                key={cardKey(account)}
                account={account}
                busy={!!busyIds[cardKey(account)]}
                error={cardErrors[cardKey(account)]}
                onToggleSuspend={handleToggleSuspend}
              />
            ))}
          </CardGrid>
        </LoadingOverlay>
      )}

      {isCreateProviderOpen && (
        <ProviderCredentialDialog
          open={isCreateProviderOpen}
          onOpenChange={setIsCreateProviderOpen}
          mode="create"
          existing={null}
          onSaved={reload}
        />
      )}
    </PageBody>
  );
}

function formatSize(mb: number, t: ReturnType<typeof useTranslations>): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ${t("unitGb")}`;
  return `${Math.round(mb)} ${t("unitMb")}`;
}

function formatUsage(
  used: number | null,
  limit: number | null,
  none: string,
  unlimited: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (used === null && limit === null) return none;
  const usedText = used === null ? none : formatSize(used, t);
  const limitText = limit === null ? unlimited : formatSize(limit, t);
  return `${usedText} / ${limitText}`;
}

// A count the plan caps reads "3 / 5". The cap alone says nothing useful
// without the count, so an unknown count keeps the dash and drops the limit.
function formatCountOfLimit(
  value: number | null,
  limit: number | null,
  none: string,
): string {
  if (value === null) return none;
  return limit === null ? String(value) : `${value} / ${limit}`;
}

// Databases are a count first and a size second: the size is a detail of the
// same fact, so it rides in the same row rather than claiming one of its own.
function formatDatabases(
  count: number | null,
  diskUsedMb: number | null,
  none: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (count === null) return none;
  if (diskUsedMb === null) return String(count);
  return `${count} · ${formatSize(diskUsedMb, t)}`;
}

// A quota is meterable only when the plan actually caps it and the provider
// reports both numbers; an unlimited or unreported quota has no fill level, so
// the row keeps its text alone. Where the ratio is known, the value carries the
// percentage too — the same wording the server cards use.
function quotaUsage(
  used: number | null,
  limit: number | null,
  none: string,
  unlimited: string,
  t: ReturnType<typeof useTranslations>,
): { text: string; percent: number | null } {
  const text = formatUsage(used, limit, none, unlimited, t);
  if (used === null || limit === null || limit <= 0) {
    return { text, percent: null };
  }
  const percent = Math.round((used / limit) * 100);
  return { text: `${text} · ${percent}%`, percent };
}

function HostingCard({
  account,
  busy,
  error,
  onToggleSuspend,
}: {
  account: Account;
  busy: boolean;
  error?: string;
  onToggleSuspend: (account: Account) => void;
}) {
  const t = useTranslations("hosting");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);

  const cardStatus = statusState[account.status as AccountStatus] ?? "unknown";
  const none = t("valueNone");
  const unlimited = t("valueUnlimited");
  const isSuspended = account.status === "suspended";

  const disk = quotaUsage(
    account.diskUsedMb,
    account.diskLimitMb,
    none,
    unlimited,
    t,
  );
  const bandwidth = quotaUsage(
    account.bandwidthUsedMb,
    account.bandwidthLimitMb,
    none,
    unlimited,
    t,
  );

  const handleConfirm = () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirmOpen(false);
    onToggleSuspend(account);
  };

  return (
    <Card
      ref={cardRef}
      role="group"
      aria-label={t("accountCardLabel", { name: account.domain })}
      tabIndex={-1}
      size="sm"
    >
      <CardHeader className="border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100">
            <Icon
              name="ri-global-line"
              aria-hidden
              className="text-base text-secondary-600"
            />
          </div>
          <div className="min-w-0">
            <CardTitle>
              <h4 className="truncate">{account.domain}</h4>
            </CardTitle>
            <CardDescription className="text-xs">
              {account.user || account.ip || account.plan}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <StatusIndicator status={cardStatus} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <MetricRows>
          {account.plan && (
            <MetricRow label={t("planLabel")} value={account.plan} />
          )}
          <MetricRow
            label={t("diskLabel")}
            value={disk.text}
            meter={
              disk.percent === null ? undefined : (
                <UsageMeter value={disk.percent} />
              )
            }
          />
          <MetricRow
            label={t("bandwidthLabel")}
            value={bandwidth.text}
            meter={
              bandwidth.percent === null ? undefined : (
                <UsageMeter value={bandwidth.percent} />
              )
            }
          />
          <MetricRow
            label={t("databasesLabel")}
            value={formatDatabases(
              account.databases,
              account.databaseDiskUsedMb,
              none,
              t,
            )}
          />
          <MetricRow
            label={t("emailLabel")}
            value={formatCountOfLimit(
              account.emailAccounts,
              account.emailAccountsLimit,
              none,
            )}
          />
          {account.phpVersion && (
            <MetricRow label={t("phpLabel")} value={account.phpVersion} />
          )}
          {account.wordpressVersion && (
            <MetricRow
              label={t("wordpressLabel")}
              value={account.wordpressVersion}
            />
          )}
          {account.ip && <MetricRow label={t("ipLabel")} value={account.ip} />}
          {account.expiresAt && (
            <MetricRow
              label={t("expiresLabel")}
              value={new Date(account.expiresAt).toLocaleDateString("ru-RU")}
            />
          )}
        </MetricRows>
        {error && (
          <Alert variant="error" className="mt-1 animate-fade-in">
            <Icon name="ri-alert-line" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {account.supportsSuspend && (
        <CardFooter className="gap-2">
          <AlertDialog
            open={confirmOpen}
            onOpenChange={(open) => {
              if (open) confirmingRef.current = false;
              setConfirmOpen(open);
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onFocus={(event) => {
                    triggerRef.current = event.currentTarget;
                  }}
                />
              }
            >
              {busy ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <Icon
                  name={
                    isSuspended ? "ri-play-circle-line" : "ri-pause-circle-line"
                  }
                  aria-hidden
                  data-icon="inline-start"
                />
              )}
              {busy
                ? t(isSuspended ? "unsuspendingLabel" : "suspendingLabel")
                : t(isSuspended ? "unsuspendAction" : "suspendAction")}
            </AlertDialogTrigger>
            <AlertDialogContent
              finalFocus={() =>
                confirmingRef.current ? cardRef.current : triggerRef.current
              }
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(
                    isSuspended
                      ? "unsuspendConfirmTitle"
                      : "suspendConfirmTitle",
                    { name: account.domain },
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    isSuspended ? "unsuspendConfirmText" : "suspendConfirmText",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                <AlertDialogAction
                  variant={isSuspended ? "default" : "destructive"}
                  onClick={handleConfirm}
                >
                  {t("confirmButton")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  );
}
