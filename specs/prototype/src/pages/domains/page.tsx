import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { mockDomains } from "@/mocks/domains";
import type { Domain, DomainProvider } from "@/mocks/domains";

type PageState = "loading" | "empty" | "ready";

interface ProviderState {
  loading: boolean;
  error: boolean;
  domains: Domain[];
}

interface NotificationState {
  message: string;
  variant: "success" | "error";
}

const allProviders: DomainProvider[] = ["Cloudflare", "Hetzner", "GoDaddy"];

const providerConfig: Record<
  DomainProvider,
  { icon: string; color: string; label: string }
> = {
  Cloudflare: {
    icon: "ri-cloud-line",
    color: "text-orange-600",
    label: "Cloudflare",
  },
  Hetzner: {
    icon: "ri-server-line",
    color: "text-red-500",
    label: "Hetzner",
  },
  GoDaddy: {
    icon: "ri-global-line",
    color: "text-emerald-600",
    label: "GoDaddy",
  },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Активен", className: "bg-accent-100/80 text-accent-800" },
  pending: {
    label: "Ожидает",
    className: "bg-secondary-100 text-secondary-800",
  },
  expired: {
    label: "Истёк",
    className: "bg-foreground-100 text-foreground-600",
  },
  transferred: {
    label: "Перенесён",
    className: "bg-secondary-100 text-secondary-700",
  },
};

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return `${n} ${few}`;
  return `${n} ${many}`;
};

export default function DomainsPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [providerStates, setProviderStates] = useState<
    Record<string, ProviderState>
  >({});
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadAllDomains = useCallback(() => {
    setPageState("loading");
    const initial: Record<string, ProviderState> = {};
    allProviders.forEach((p) => {
      initial[p] = { loading: true, error: false, domains: [] };
    });
    setProviderStates(initial);

    if (mockDomains.length === 0) {
      setTimeout(() => setPageState("empty"), 500);
      return;
    }

    // Simulate per-provider loading with staggered completion
    allProviders.forEach((provider) => {
      const delay = 400 + Math.random() * 600;
      setTimeout(() => {
        // ~10% chance of per-provider failure
        const shouldFail = Math.random() < 0.1;
        if (shouldFail) {
          setProviderStates((prev) => ({
            ...prev,
            [provider]: { loading: false, error: true, domains: [] },
          }));
        } else {
          const domains = mockDomains.filter((d) => d.provider === provider);
          setProviderStates((prev) => ({
            ...prev,
            [provider]: { loading: false, error: false, domains },
          }));
        }
        // Mark ready once all providers have resolved
        setProviderStates((prev) => {
          if (allProviders.every((p) => !prev[p]?.loading)) {
            setPageState("ready");
          }
          return prev;
        });
      }, delay);
    });
  }, []);

  const retryProvider = useCallback((provider: DomainProvider) => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { loading: true, error: false, domains: [] },
    }));
    setTimeout(() => {
      const domains = mockDomains.filter((d) => d.provider === provider);
      setProviderStates((prev) => ({
        ...prev,
        [provider]: { loading: false, error: false, domains },
      }));
    }, 700);
  }, []);

  useEffect(() => {
    loadAllDomains();
  }, [loadAllDomains]);

  const totalDomains = Object.values(providerStates).reduce(
    (sum, ps) => sum + (ps.domains?.length || 0),
    0,
  );

  const hasAnyError = Object.values(providerStates).some((ps) => ps.error);

  // Empty state — no domains at all
  if (pageState === "empty") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
            <i className="ri-global-line text-2xl text-secondary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Нет доменов
          </h3>
          <p className="text-sm text-foreground-500">
            В ваших аккаунтах пока нет доменов. Добавьте домен через панель
            провайдера, и он отобразится здесь.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === "success"
              ? "bg-accent-100/80 text-accent-800"
              : "bg-primary-100/70 text-primary-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${
              notification.variant === "success"
                ? "ri-check-line"
                : "ri-error-warning-line"
            } w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-foreground-500">
          {plural(totalDomains, "домен", "домена", "доменов")}
        </p>
        <button
          onClick={loadAllDomains}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

      <div className="space-y-6">
        {allProviders.map((provider) => (
          <ProviderSection
            key={provider}
            provider={provider}
            state={providerStates[provider]}
            onRetry={() => retryProvider(provider)}
            onViewDns={(domainId) => navigate(`/domains/dns/${domainId}`)}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderSection({
  provider,
  state,
  onRetry,
  onViewDns,
}: {
  provider: DomainProvider;
  state?: ProviderState;
  onRetry: () => void;
  onViewDns: (domainId: string) => void;
}) {
  const cfg = providerConfig[provider];

  // Loading state — skeleton rows
  if (!state || state.loading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="animate-skeleton h-4 w-28 rounded"></div>
          <div className="animate-skeleton h-4 w-8 rounded-full"></div>
        </div>
        <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-100">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap">
                  Домен
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap hidden sm:table-cell">
                  Статус
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap hidden md:table-cell">
                  Истекает
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap hidden lg:table-cell">
                  NS
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-foreground-500 whitespace-nowrap w-16"></th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr
                  key={i}
                  className="border-b border-background-50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="animate-skeleton h-4 w-36 rounded"></div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="animate-skeleton h-5 w-20 rounded-full"></div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="animate-skeleton h-3 w-20 rounded"></div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="animate-skeleton h-3 w-40 rounded"></div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="animate-skeleton h-7 w-16 rounded-lg ml-auto"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Error state for this provider
  if (state.error) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <i
            className={`${cfg.icon} ${cfg.color} text-base w-5 h-5 flex items-center justify-center`}
          ></i>
          <span className="font-heading font-semibold text-sm text-foreground-900">
            {cfg.label}
          </span>
        </div>
        <div className="rounded-xl border border-background-200 bg-background-50 p-5 text-center">
          <p className="text-sm text-foreground-500 mb-3">
            Не удалось загрузить домены {cfg.label}. Проверьте подключение.
          </p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-700 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // Empty provider — no domains from this provider
  if (state.domains.length === 0) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <i
            className={`${cfg.icon} ${cfg.color} text-base w-5 h-5 flex items-center justify-center`}
          ></i>
          <span className="font-heading font-semibold text-sm text-foreground-900">
            {cfg.label}
          </span>
          <span className="text-xs text-foreground-400">— нет доменов</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-2.5">
        <i
          className={`${cfg.icon} ${cfg.color} text-base w-5 h-5 flex items-center justify-center`}
        ></i>
        <span className="font-heading font-semibold text-sm text-foreground-900">
          {cfg.label}
        </span>
        <span className="text-xs text-foreground-400 ml-1">
          {plural(state.domains.length, "домен", "домена", "доменов")}
        </span>
      </div>
      <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
        {/* Desktop table */}
        <table className="w-full hidden sm:table">
          <thead>
            <tr className="border-b border-background-100">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap">
                Домен
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap">
                Статус
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap hidden md:table-cell">
                Истекает
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap hidden lg:table-cell">
                NS-серверы
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-foreground-500 whitespace-nowrap w-28">
                DNS
              </th>
            </tr>
          </thead>
          <tbody>
            {state.domains.map((domain) => (
              <tr
                key={domain.id}
                className="border-b border-background-50 last:border-0 hover:bg-background-100/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-foreground-900">
                      {domain.name}
                    </span>
                    <span className="text-xs text-foreground-400 ml-1.5">
                      {domain.registrar}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[domain.status]?.className || ""}`}
                  >
                    {statusConfig[domain.status]?.label || domain.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-foreground-600 hidden md:table-cell whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {domain.autoRenew && (
                      <i
                        className="ri-loop-left-line text-xs text-accent-600 w-4 h-4 flex items-center justify-center"
                        title="Автопродление"
                      ></i>
                    )}
                    {domain.expiresAt}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-foreground-400 hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {domain.nameservers.map((ns) => (
                      <span
                        key={ns}
                        className="inline-block bg-background-100 rounded px-1.5 py-0.5 text-xs"
                      >
                        {ns}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onViewDns(domain.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-list-3-line w-4 h-4 flex items-center justify-center"></i>
                    DNS
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-background-50">
          {state.domains.map((domain) => (
            <div key={domain.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground-900">
                  {domain.name}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[domain.status]?.className || ""}`}
                >
                  {statusConfig[domain.status]?.label || domain.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-400">
                  {domain.registrar}
                </span>
                <span className="text-xs text-foreground-500">
                  {domain.expiresAt}
                  {domain.autoRenew ? " · автопродление" : ""}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs text-foreground-400 truncate max-w-[60%]">
                  {domain.nameservers[0]}
                </span>
                <button
                  onClick={() => onViewDns(domain.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-file-list-3-line w-4 h-4 flex items-center justify-center"></i>
                  DNS
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
