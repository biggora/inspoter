"use client";

import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  fetchAccounts,
  getAccount,
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

const statusConfig: Record<
  string,
  { labelKey: string; variant: "success" | "secondary" | "warning" }
> = {
  active: { labelKey: "statusActive", variant: "success" },
  suspended: { labelKey: "statusSuspended", variant: "warning" },
  unknown: { labelKey: "statusUnknown", variant: "secondary" },
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const groups: AccountsByProviderDto[] = await fetchAccounts();
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
  }, [t]);

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

  const pageState: PageState = loading
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
              <Button variant="outline" onClick={load}>
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
        <CardGrid>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} size="sm" className="animate-fade-in">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <CardAction>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex items-center justify-between">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      )}

      {pageState === "error" && (
        <EmptyState
          tone="danger"
          icon="ri-cloud-off-line"
          title={t("providerUnavailableTitle")}
          description={t("providerUnavailableDescription")}
          action={
            <Button onClick={load}>
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
            <Button
              render={<Link href="/settings/providers" />}
              nativeButton={false}
            >
              {t("addProviderButton")}
            </Button>
          }
        />
      )}

      {pageState === "ready" && (
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
      )}

      {isCreateProviderOpen && (
        <ProviderCredentialDialog
          open={isCreateProviderOpen}
          onOpenChange={setIsCreateProviderOpen}
          mode="create"
          existing={null}
          onSaved={load}
        />
      )}
    </PageBody>
  );
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ГБ`;
  return `${Math.round(mb)} МБ`;
}

function formatUsage(
  used: number | null,
  limit: number | null,
  none: string,
  unlimited: string,
): string {
  if (used === null && limit === null) return none;
  const usedText = used === null ? none : formatSize(used);
  const limitText = limit === null ? unlimited : formatSize(limit);
  return `${usedText} / ${limitText}`;
}

function formatCount(value: number | null, none: string): string {
  return value === null ? none : String(value);
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

  const config =
    statusConfig[account.status as AccountStatus] ?? statusConfig.unknown;
  const none = t("valueNone");
  const unlimited = t("valueUnlimited");
  const isSuspended = account.status === "suspended";

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
          <Badge variant={config.variant}>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full bg-current",
                busy && "animate-pulse motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
            {t(config.labelKey)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        {account.plan && (
          <MetricRow label={t("planLabel")} value={account.plan} />
        )}
        <MetricRow
          label={t("diskLabel")}
          value={formatUsage(
            account.diskUsedMb,
            account.diskLimitMb,
            none,
            unlimited,
          )}
        />
        <MetricRow
          label={t("bandwidthLabel")}
          value={formatUsage(
            account.bandwidthUsedMb,
            account.bandwidthLimitMb,
            none,
            unlimited,
          )}
        />
        <MetricRow
          label={t("databasesLabel")}
          value={formatCount(account.databases, none)}
        />
        <MetricRow
          label={t("emailLabel")}
          value={formatCount(account.emailAccounts, none)}
        />
        {account.ip && <MetricRow label={t("ipLabel")} value={account.ip} />}
        {account.expiresAt && (
          <MetricRow
            label={t("expiresLabel")}
            value={new Date(account.expiresAt).toLocaleDateString("ru-RU")}
          />
        )}
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-foreground-500">{label}</span>
      <span className="text-foreground-800 font-medium truncate max-w-[60%] text-right">
        {value}
      </span>
    </div>
  );
}
