"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DomainsByProvider } from "@/lib/services/domains";
import { DnsRecordsView } from "./dns-records-view";

interface DomainsViewProps {
  providers: DomainsByProvider[];
}

const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare",
  hetzner: "Hetzner DNS",
  godaddy: "GoDaddy",
};

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
  const router = useRouter();
  const [isRetrying, startTransition] = useTransition();
  const [selected, setSelected] = useState<SelectedDomain | null>(null);

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
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Домены</h1>

      {erroredProviders.length > 0 && (
        <div className="flex flex-col gap-2">
          {erroredProviders.map((provider) => (
            <Alert
              key={provider.providerId}
              className="flex flex-row items-center justify-between gap-4 border-(--error-bg) bg-(--error-bg)"
            >
              <div className="flex items-center gap-2">
                <TriangleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-(--error-text)"
                />
                <AlertDescription className="text-(--error-text)">
                  <span className="font-medium">
                    {providerLabel(provider.providerId)}
                  </span>{" "}
                  — {provider.error}
                </AlertDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? "Повтор…" : "Повторить"}
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
              ? "Нет доменов от исправных провайдеров"
              : "Доменов пока нет"
          }
          description="Домены появятся автоматически при подключении DNS-провайдера в настройках."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Домен</TableHead>
              <TableHead>Провайдер</TableHead>
              <TableHead className="text-right">Действия</TableHead>
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
                    Просмотр DNS
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
