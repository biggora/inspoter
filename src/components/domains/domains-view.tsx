"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DomainsByProvider } from "@/lib/services/domains";
import { ProviderCredentialDialog } from "@/components/settings/provider-credential-dialog";
import { DnsRecordsView } from "./dns-records-view";

interface DomainsViewProps {
  providers: DomainsByProvider[];
}

const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare",
  hetzner: "Hetzner DNS",
  godaddy: "GoDaddy",
};

const PROVIDER_ERROR_KEYS: Record<string, string> = {
  "Provider unreachable": "errorProviderUnreachable",
  "Authentication failed": "errorAuthFailed",
  "Rate limited": "errorRateLimited",
  "Provider error": "errorProviderGeneric",
};

function providerErrorMessage(
  error: string | null,
  t: ReturnType<typeof useTranslations>,
): string {
  const key = error && PROVIDER_ERROR_KEYS[error];
  return key ? t(key) : t("errorProviderFallback");
}

function providerLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

interface SelectedDomain {
  providerId: string;
  domainId: string;
  domainName: string;
}

// Domains list (design.md §6.1, AC-DOM-001..003). `providers` is the server
// component's data — no client-held copy beyond dialog/drill-in UI state
// (matches bookmarks/bookmarks-board.tsx); "Retry" re-runs the server
// component via router.refresh() since a single provider can't be
// refetched in isolation (the /api/domains route aggregates all of them).
export function DomainsView({ providers }: DomainsViewProps) {
  const t = useTranslations("domains");
  const router = useRouter();
  const [isRetrying, startTransition] = useTransition();
  const [selected, setSelected] = useState<SelectedDomain | null>(null);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);

  if (selected) {
    return (
      <DnsRecordsView
        providerId={selected.providerId}
        domainId={selected.domainId}
        domainName={selected.domainName}
        onBack={() => setSelected(null)}
      />
    );
  }

  const erroredProviders = providers.filter((provider) => provider.error);
  const domains = providers.flatMap((provider) =>
    provider.domains.map((domain) => ({
      ...domain,
      providerId: provider.providerId,
    })),
  );

  function handleRetry() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <Button onClick={() => setIsCreateProviderOpen(true)}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("addProviderButton")}
          </Button>
        }
      />

      {erroredProviders.length > 0 && (
        <div className="flex flex-col gap-2">
          {erroredProviders.map((provider) => (
            <Alert
              key={provider.providerId}
              variant="error"
              className="flex flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <Icon
                  name="ri-alert-line"
                  aria-hidden
                  className="text-base shrink-0"
                />
                <AlertDescription>
                  <span className="font-medium">
                    {providerLabel(provider.providerId)}
                  </span>{" "}
                  — {providerErrorMessage(provider.error, t)}
                </AlertDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? t("retryingLabel") : t("retryButton")}
              </Button>
            </Alert>
          ))}
        </div>
      )}

      {domains.length === 0 ? (
        <EmptyState
          icon="ri-global-line"
          title={
            erroredProviders.length > 0
              ? t("emptyTitleErrored")
              : t("emptyTitle")
          }
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setIsCreateProviderOpen(true)}>
              {t("addProviderAction")}
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("domainHeader")}</TableHead>
              <TableHead>{t("providerHeader")}</TableHead>
              <TableHead className="text-right">
                {t("actionsHeader")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={`${domain.providerId}-${domain.id}`}>
                <TableCell className="font-mono">{domain.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {providerLabel(domain.providerId)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelected({
                        providerId: domain.providerId,
                        domainId: domain.id,
                        domainName: domain.name,
                      })
                    }
                  >
                    {t("viewDnsButton")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {isCreateProviderOpen && (
        <ProviderCredentialDialog
          open={isCreateProviderOpen}
          onOpenChange={setIsCreateProviderOpen}
          mode="create"
          existing={null}
          onSaved={() => router.refresh()}
        />
      )}
    </PageBody>
  );
}
