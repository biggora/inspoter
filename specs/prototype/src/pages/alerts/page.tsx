import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { mockAlerts, alertSeverities } from "@/mocks/alerts";
import type { AlertEntry, AlertSeverity } from "@/mocks/alerts";

type PageState = "loading" | "error" | "ready";

const PAGE_SIZE = 10;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins}м`;
  if (diffHours < 24) return `${diffHours}ч`;
  if (diffDays < 7) return `${diffDays}дн`;

  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AlertsPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "">("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [ackFilter, setAckFilter] = useState<"all" | "unack" | "ack">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const sourceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setCurrentPage(1);
  }, []);

  // Load alerts
  const loadAlerts = useCallback(() => {
    setPageState("loading");
    setExpandedId(null);
    setTimeout(() => {
      setAlerts(mockAlerts.map((a) => ({ ...a })));
      setPageState("ready");
    }, 600);
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Filter and sort
  const filteredAlerts = useMemo(() => {
    let list = [...alerts];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          a.service.toLowerCase().includes(q),
      );
    }

    if (severityFilter) {
      list = list.filter((a) => a.severity === severityFilter);
    }

    if (sourceFilter) {
      list = list.filter((a) => a.source === sourceFilter);
    }

    if (ackFilter === "unack") {
      list = list.filter((a) => !a.acknowledged);
    } else if (ackFilter === "ack") {
      list = list.filter((a) => a.acknowledged);
    }

    list.sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });

    return list;
  }, [
    alerts,
    debouncedSearch,
    severityFilter,
    sourceFilter,
    ackFilter,
    sortOrder,
  ]);

  // Unique sources
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>();
    return alerts.filter((a) => {
      if (seen.has(a.source)) return false;
      seen.add(a.source);
      return true;
    });
  }, [alerts]);

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts: Record<AlertSeverity, { total: number; unack: number }> = {
      critical: { total: 0, unack: 0 },
      warning: { total: 0, unack: 0 },
      info: { total: 0, unack: 0 },
    };
    filteredAlerts.forEach((a) => {
      counts[a.severity].total++;
      if (!a.acknowledged) counts[a.severity].unack++;
    });
    return counts;
  }, [filteredAlerts]);

  // Group filtered alerts by severity for display
  const groupedAlerts = useMemo(() => {
    const groups: { severity: AlertSeverity; alerts: AlertEntry[] }[] = [];
    const severityOrder: AlertSeverity[] = ["critical", "warning", "info"];
    severityOrder.forEach((sev) => {
      const groupAlerts = filteredAlerts.filter((a) => a.severity === sev);
      if (groupAlerts.length > 0) {
        groups.push({ severity: sev, alerts: groupAlerts });
      }
    });
    return groups;
  }, [filteredAlerts]);

  // Flatten for pagination
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedAlerts = filteredAlerts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const hasActiveFilters =
    !!debouncedSearch ||
    !!severityFilter ||
    !!sourceFilter ||
    ackFilter !== "all" ||
    sortOrder !== "newest";

  const handleSeveritySelect = useCallback(
    (severity: AlertSeverity | "") => {
      setSeverityFilter(severity === severityFilter ? "" : severity);
      setCurrentPage(1);
    },
    [severityFilter],
  );

  const handleSourceSelect = useCallback((source: string) => {
    setSourceFilter(source);
    setSourceDropdownOpen(false);
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setSeverityFilter("");
    setSourceFilter("");
    setAckFilter("all");
    setSortOrder("newest");
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    setExpandedId(null);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAcknowledge = useCallback(
    (id: string) => {
      setAlerts((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const now = new Date().toISOString();
          return {
            ...a,
            acknowledged: !a.acknowledged,
            acknowledgedAt: a.acknowledged ? undefined : now,
            acknowledgedBy: a.acknowledged ? undefined : "admin",
          };
        }),
      );
      const alert = alerts.find((a) => a.id === id);
      if (alert) {
        setNotification({
          message: alert.acknowledged
            ? "Оповещение снято с подтверждения"
            : "Оповещение подтверждено",
          variant: "success",
        });
      }
    },
    [alerts],
  );

  const handleAcknowledgeAll = useCallback(
    (severity: AlertSeverity) => {
      setAlerts((prev) =>
        prev.map((a) => {
          if (a.severity !== severity || a.acknowledged) return a;
          return {
            ...a,
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: "admin",
          };
        }),
      );
      const count = alerts.filter(
        (a) => a.severity === severity && !a.acknowledged,
      ).length;
      if (count > 0) {
        setNotification({
          message: `Подтверждено ${count} ${severity === "critical" ? "критических" : severity === "warning" ? "предупреждений" : "информационных"} оповещений`,
          variant: "success",
        });
      }
    },
    [alerts],
  );

  // Loading skeletons
  if (pageState === "loading") {
    return (
      <div className="p-6">
        {/* Stats skeleton */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-24 rounded-xl"></div>
          ))}
        </div>
        {/* Filter bar skeleton */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="animate-skeleton h-9 w-72 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-24 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-28 rounded-lg"></div>
        </div>
        {/* Alert cards */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-skeleton h-20 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-alert-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Не удалось загрузить оповещения
          </h3>
          <p className="text-sm text-foreground-500 mb-6">
            Проверьте подключение к системе мониторинга и попробуйте снова.
          </p>
          <button
            onClick={loadAlerts}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Notification toast */}
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

      {/* ===== STATS CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center">
              <i className="ri-notification-3-line text-sm text-secondary-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              Всего
            </span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">
            {filteredAlerts.length}
          </p>
          <p className="text-[11px] text-foreground-400 mt-0.5">
            {severityCounts.critical.unack +
              severityCounts.warning.unack +
              severityCounts.info.unack}{" "}
            не подтверждено
          </p>
        </div>

        {/* Critical */}
        <button
          onClick={() => handleSeveritySelect("critical")}
          className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
            severityFilter === "critical"
              ? "border-red-300 bg-red-50/50"
              : "border-background-200 bg-background-50 hover:border-red-200 hover:bg-red-50/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <i className="ri-close-circle-fill text-sm text-red-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              Критические
            </span>
          </div>
          <p className="text-2xl font-heading font-bold text-red-700">
            {severityCounts.critical.total}
          </p>
          {severityCounts.critical.unack > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-red-100 text-[11px] font-semibold text-red-700">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              {severityCounts.critical.unack} не подтверждено
            </span>
          )}
        </button>

        {/* Warning */}
        <button
          onClick={() => handleSeveritySelect("warning")}
          className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
            severityFilter === "warning"
              ? "border-amber-300 bg-amber-50/50"
              : "border-background-200 bg-background-50 hover:border-amber-200 hover:bg-amber-50/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <i className="ri-alert-fill text-sm text-amber-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              Предупреждения
            </span>
          </div>
          <p className="text-2xl font-heading font-bold text-amber-700">
            {severityCounts.warning.total}
          </p>
          {severityCounts.warning.unack > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-[11px] font-semibold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {severityCounts.warning.unack} не подтверждено
            </span>
          )}
        </button>

        {/* Info */}
        <button
          onClick={() => handleSeveritySelect("info")}
          className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
            severityFilter === "info"
              ? "border-accent-300 bg-accent-50/50"
              : "border-background-200 bg-background-50 hover:border-accent-200 hover:bg-accent-50/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-information-fill text-sm text-accent-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              Информация
            </span>
          </div>
          <p className="text-2xl font-heading font-bold text-accent-700">
            {severityCounts.info.total}
          </p>
          {severityCounts.info.unack > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-accent-100 text-[11px] font-semibold text-accent-700">
              {severityCounts.info.unack} не подтверждено
            </span>
          )}
        </button>
      </div>

      {/* ===== FILTER BAR ===== */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400 w-5 h-5 flex items-center justify-center"></i>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по заголовку, источнику или сервису..."
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-background-200 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-700 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          )}
        </div>

        {/* Acknowledged filter - Segmented control */}
        <div className="inline-flex items-center rounded-full border border-background-200 bg-background-50 p-1">
          <button
            onClick={() => {
              setAckFilter("all");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              ackFilter === "all"
                ? "bg-primary-500 text-background-50"
                : "text-foreground-500 hover:text-foreground-700"
            }`}
          >
            Все
          </button>
          <button
            onClick={() => {
              setAckFilter("unack");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              ackFilter === "unack"
                ? "bg-primary-500 text-background-50"
                : "text-foreground-500 hover:text-foreground-700"
            }`}
          >
            Не подтверждённые
          </button>
          <button
            onClick={() => {
              setAckFilter("ack");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              ackFilter === "ack"
                ? "bg-primary-500 text-background-50"
                : "text-foreground-500 hover:text-foreground-700"
            }`}
          >
            Подтверждённые
          </button>
        </div>

        {/* Source filter */}
        <div className="relative" ref={sourceRef}>
          <button
            onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap border ${
              sourceFilter
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-background-200 text-foreground-500 hover:text-foreground-700 hover:border-background-300"
            }`}
          >
            <i className="ri-computer-line w-4 h-4 flex items-center justify-center"></i>
            {sourceFilter || "Источник"}
            <i
              className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${sourceDropdownOpen ? "rotate-180" : ""}`}
            ></i>
          </button>
          {sourceDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 w-56 bg-background-50 border border-background-200 rounded-lg shadow-lg animate-scale-in overflow-hidden">
              <div className="max-h-64 overflow-y-auto py-1">
                <button
                  onClick={() => handleSourceSelect("")}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${!sourceFilter ? "bg-primary-50 text-primary-700" : "text-foreground-700 hover:bg-background-100"}`}
                >
                  Все источники ({uniqueSources.length})
                </button>
                {uniqueSources.map((s) => (
                  <button
                    key={s.source}
                    onClick={() => handleSourceSelect(s.source)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center justify-between ${sourceFilter === s.source ? "bg-primary-50 text-primary-700" : "text-foreground-700 hover:bg-background-100"}`}
                  >
                    <span className="truncate">{s.source}</span>
                    <span className="text-[10px] text-foreground-400 uppercase ml-2 shrink-0">
                      {s.service}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => {
            setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
            setCurrentPage(1);
          }}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-background-200 text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:border-background-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i
            className={`${sortOrder === "newest" ? "ri-sort-desc" : "ri-sort-asc"} w-4 h-4 flex items-center justify-center`}
          ></i>
          {sortOrder === "newest" ? "Новые" : "Старые"}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
            Сбросить
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={loadAlerts}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          title="Обновить"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

      {/* ===== ALERT LIST ===== */}
      {filteredAlerts.length === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center animate-scale-in">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
              <i className="ri-check-double-line text-2xl text-secondary-600"></i>
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
              {alerts.length === 0 ? "Нет оповещений" : "Ничего не найдено"}
            </h3>
            <p className="text-sm text-foreground-500 mb-6">
              {alerts.length === 0
                ? "Сейчас нет активных оповещений. Система работает в штатном режиме."
                : "Попробуйте изменить параметры поиска или сбросить фильтры."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-close-line w-5 h-5 flex items-center justify-center"></i>
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {/* Group by severity */}
            {(severityFilter
              ? [{ severity: severityFilter, alerts: filteredAlerts }]
              : groupedAlerts
            ).map((group) => {
              const sevInfo = alertSeverities[group.severity];
              // Only paginate alerts within each group for the current page
              const groupPageAlerts = severityFilter
                ? pagedAlerts
                : group.alerts.filter((a) => {
                    const idx = filteredAlerts.indexOf(a);
                    return (
                      idx >= (safePage - 1) * PAGE_SIZE &&
                      idx < safePage * PAGE_SIZE
                    );
                  });
              if (groupPageAlerts.length === 0) return null;

              const unackInGroup = group.alerts.filter(
                (a) => !a.acknowledged,
              ).length;

              return (
                <div key={group.severity}>
                  {/* Severity header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-3 h-3 rounded-full ${sevInfo.dot}`}
                    ></div>
                    <h3 className="font-heading text-sm font-semibold text-foreground-900 uppercase tracking-wide">
                      {sevInfo.label}
                    </h3>
                    <span className="text-xs text-foreground-400">
                      {group.alerts.length}{" "}
                      {group.alerts.length === 1
                        ? "оповещение"
                        : group.alerts.length >= 2 && group.alerts.length <= 4
                          ? "оповещения"
                          : "оповещений"}
                    </span>
                    {unackInGroup > 0 && (
                      <button
                        onClick={() => handleAcknowledgeAll(group.severity)}
                        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-double-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        Подтвердить все ({unackInGroup})
                      </button>
                    )}
                  </div>

                  {/* Alert cards */}
                  <div className="space-y-2">
                    {groupPageAlerts.map((alert) => {
                      const isExpanded = expandedId === alert.id;
                      const aSevInfo = alertSeverities[alert.severity];

                      return (
                        <div
                          key={alert.id}
                          className={`rounded-xl border transition-colors ${
                            isExpanded
                              ? "border-background-300 bg-background-100/40"
                              : alert.acknowledged
                                ? "border-background-200 bg-background-50 hover:border-background-300"
                                : "border-background-200 bg-background-50 hover:border-background-300"
                          } ${!alert.acknowledged ? "border-l-[3px]" : ""}`}
                          style={
                            !alert.acknowledged
                              ? {
                                  borderLeftColor: `var(--${group.severity === "critical" ? "red" : group.severity === "warning" ? "amber" : "accent"}-500)`,
                                }
                              : undefined
                          }
                        >
                          {/* Card header — clickable */}
                          <button
                            onClick={() => toggleExpand(alert.id)}
                            className="w-full text-left px-4 py-3 cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              {/* Severity icon */}
                              <div
                                className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${aSevInfo.bg}`}
                              >
                                <i
                                  className={`${aSevInfo.icon} text-sm ${aSevInfo.color.split(" ")[0]}`}
                                ></i>
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h4 className="text-sm font-semibold text-foreground-900">
                                    {alert.title}
                                  </h4>
                                  {!alert.acknowledged && (
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${aSevInfo.bg} ${aSevInfo.color}`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${aSevInfo.dot} ${group.severity === "critical" ? "animate-pulse" : ""}`}
                                      ></span>
                                      Не подтверждено
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-foreground-500 leading-relaxed line-clamp-2">
                                  {alert.message}
                                </p>
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                  <span className="text-[11px] font-medium text-foreground-600">
                                    {alert.source}
                                  </span>
                                  <span className="text-[10px] text-foreground-400 uppercase">
                                    {alert.service}
                                  </span>
                                  <span
                                    className="text-[11px] text-foreground-400"
                                    title={formatAbsoluteTime(alert.timestamp)}
                                  >
                                    {formatRelativeTime(alert.timestamp)}
                                  </span>
                                  {alert.acknowledged &&
                                    alert.acknowledgedBy && (
                                      <span className="text-[10px] text-foreground-400 flex items-center gap-1">
                                        <i className="ri-check-line w-3 h-3 flex items-center justify-center text-accent-600"></i>
                                        {alert.acknowledgedBy}
                                      </span>
                                    )}
                                </div>
                              </div>

                              {/* Expand icon */}
                              <i
                                className={`${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} w-5 h-5 flex items-center justify-center text-foreground-400 shrink-0 mt-1`}
                              ></i>
                            </div>
                          </button>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-background-200 px-4 py-4 bg-background-100/40 animate-fade-in">
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-[11px] text-foreground-400">
                                  {formatAbsoluteTime(alert.timestamp)}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${aSevInfo.bg} ${aSevInfo.color}`}
                                >
                                  <i
                                    className={`${aSevInfo.icon} w-3 h-3 flex items-center justify-center`}
                                  ></i>
                                  {aSevInfo.label}
                                </span>
                                <span className="text-xs font-medium text-foreground-700">
                                  {alert.source}
                                </span>
                                <span className="text-[10px] text-foreground-400 uppercase">
                                  {alert.service}
                                </span>
                              </div>
                              <p className="text-sm text-foreground-800 mb-3 leading-relaxed">
                                {alert.message}
                              </p>
                              {alert.details && (
                                <div className="rounded-lg border border-background-200 bg-background-50 p-3 overflow-x-auto mb-3">
                                  <pre className="text-xs text-foreground-600 font-mono whitespace-pre-wrap break-all leading-relaxed">
                                    {alert.details}
                                  </pre>
                                </div>
                              )}

                              {/* Acknowledgment info */}
                              {alert.acknowledged && (
                                <div className="flex items-center gap-2 mb-3 text-[11px] text-foreground-500">
                                  <i className="ri-check-double-line w-4 h-4 flex items-center justify-center text-accent-600"></i>
                                  Подтверждено{" "}
                                  {alert.acknowledgedBy && (
                                    <span className="font-medium text-foreground-700">
                                      @{alert.acknowledgedBy}
                                    </span>
                                  )}
                                  {alert.acknowledgedAt && (
                                    <span>
                                      ,{" "}
                                      {formatAbsoluteTime(alert.acknowledgedAt)}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleAcknowledge(alert.id)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                                    alert.acknowledged
                                      ? "text-foreground-500 hover:text-foreground-700 hover:bg-background-200/50"
                                      : "bg-primary-500 text-background-50 hover:bg-primary-600"
                                  }`}
                                >
                                  <i
                                    className={`${alert.acknowledged ? "ri-arrow-go-back-line" : "ri-check-line"} w-4 h-4 flex items-center justify-center`}
                                  ></i>
                                  {alert.acknowledged
                                    ? "Отменить подтверждение"
                                    : "Подтвердить"}
                                </button>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      `[${formatAbsoluteTime(alert.timestamp)}] [${alert.severity.toUpperCase()}] [${alert.source}/${alert.service}] ${alert.title}\n${alert.message}\n${alert.details}`,
                                    );
                                    setNotification({
                                      message: "Скопировано в буфер обмена",
                                      variant: "success",
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-200/50 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <i className="ri-file-copy-line w-4 h-4 flex items-center justify-center"></i>
                                  Копировать
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <i className="ri-arrow-left-s-line w-4 h-4 flex items-center justify-center"></i>
                Назад
              </button>
              <span className="text-xs text-foreground-400">
                {safePage} / {totalPages} ({filteredAlerts.length} оповещений)
              </span>
              <button
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Вперёд
                <i className="ri-arrow-right-s-line w-4 h-4 flex items-center justify-center"></i>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
