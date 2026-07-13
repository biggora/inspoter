import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { mockLogs, logLevels } from "@/mocks/logs";
import type { LogEntry, LogLevel } from "@/mocks/logs";

type PageState = "loading" | "error" | "ready";

const PAGE_SIZE = 15;

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
    second: "2-digit",
  });
}

export default function LogsPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogLevel | "">("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const levelRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (levelRef.current && !levelRef.current.contains(e.target as Node)) {
        setLevelDropdownOpen(false);
      }
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

  // Load logs
  const loadLogs = useCallback(() => {
    setPageState("loading");
    setExpandedId(null);
    setTimeout(() => {
      setLogs(mockLogs.map((l) => ({ ...l })));
      setPageState("ready");
    }, 600);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Filter and sort
  const filteredLogs = useMemo(() => {
    let list = [...logs];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.source.toLowerCase().includes(q) ||
          l.service.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q),
      );
    }

    if (levelFilter) {
      list = list.filter((l) => l.level === levelFilter);
    }

    if (sourceFilter) {
      list = list.filter((l) => l.source === sourceFilter);
    }

    list.sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });

    return list;
  }, [logs, debouncedSearch, levelFilter, sourceFilter, sortOrder]);

  // Unique sources for filter dropdown
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>();
    return logs.filter((l) => {
      if (seen.has(l.source)) return false;
      seen.add(l.source);
      return true;
    });
  }, [logs]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLogs = filteredLogs.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const hasActiveFilters =
    !!debouncedSearch ||
    !!levelFilter ||
    !!sourceFilter ||
    sortOrder !== "newest";

  // Level counts
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      counts[l.level] = (counts[l.level] || 0) + 1;
    });
    return counts;
  }, [filteredLogs]);

  const handleLevelSelect = useCallback((level: LogLevel | "") => {
    setLevelFilter(level);
    setLevelDropdownOpen(false);
    setCurrentPage(1);
  }, []);

  const handleSourceSelect = useCallback((source: string) => {
    setSourceFilter(source);
    setSourceDropdownOpen(false);
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setLevelFilter("");
    setSourceFilter("");
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

  // Loading skeletons
  if (pageState === "loading") {
    return (
      <div className="p-6">
        {/* Filter bar skeleton */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="animate-skeleton h-9 w-72 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-28 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-32 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-10 rounded-lg ml-auto"></div>
        </div>
        {/* Log rows */}
        <div className="rounded-xl border border-background-200 overflow-hidden">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b border-background-100 last:border-b-0"
            >
              <div className="animate-skeleton w-12 h-5 rounded-full shrink-0"></div>
              <div className="animate-skeleton w-3 h-3 rounded-full shrink-0"></div>
              <div className="animate-skeleton w-20 h-4 rounded shrink-0"></div>
              <div className="animate-skeleton w-14 h-4 rounded shrink-0"></div>
              <div className="animate-skeleton flex-1 h-4 rounded"></div>
              <div className="animate-skeleton w-6 h-6 rounded shrink-0"></div>
            </div>
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
            <i className="ri-file-list-3-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Не удалось загрузить логи
          </h3>
          <p className="text-sm text-foreground-500 mb-6">
            Проверьте подключение к системе логирования и попробуйте снова.
          </p>
          <button
            onClick={loadLogs}
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

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 text-xs text-foreground-500">
          <span className="font-medium text-foreground-700">
            {filteredLogs.length}
          </span>
          {filteredLogs.length === 1
            ? " запись"
            : filteredLogs.length >= 2 && filteredLogs.length <= 4
              ? " записи"
              : " записей"}
        </div>

        {/* Level counts */}
        {(Object.keys(levelCounts) as LogLevel[]).map((level) => {
          const info = logLevels[level];
          return (
            <span
              key={level}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${info.bg} ${info.color}`}
            >
              {info.label}
              <span className="opacity-70">{levelCounts[level]}</span>
            </span>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            title="Обновить"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            Обновить
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400 w-5 h-5 flex items-center justify-center"></i>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по сообщению, источнику или сервису..."
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

        {/* Level filter */}
        <div className="relative" ref={levelRef}>
          <button
            onClick={() => {
              setLevelDropdownOpen(!levelDropdownOpen);
              setSourceDropdownOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap border ${
              levelFilter
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-background-200 text-foreground-500 hover:text-foreground-700 hover:border-background-300"
            }`}
          >
            <i className="ri-filter-3-line w-4 h-4 flex items-center justify-center"></i>
            {levelFilter ? logLevels[levelFilter as LogLevel].label : "Уровень"}
            <i
              className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${levelDropdownOpen ? "rotate-180" : ""}`}
            ></i>
          </button>
          {levelDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 w-40 bg-background-50 border border-background-200 rounded-lg shadow-lg animate-scale-in overflow-hidden">
              <div className="py-1">
                <button
                  onClick={() => handleLevelSelect("")}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${!levelFilter ? "bg-primary-50 text-primary-700" : "text-foreground-700 hover:bg-background-100"}`}
                >
                  Все уровни
                </button>
                {(Object.keys(logLevels) as LogLevel[]).map((level) => {
                  const info = logLevels[level];
                  return (
                    <button
                      key={level}
                      onClick={() => handleLevelSelect(level)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2 ${levelFilter === level ? "bg-primary-50 text-primary-700" : "text-foreground-700 hover:bg-background-100"}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded ${info.bg}`}
                      >
                        <i
                          className={`${info.icon} text-[10px] ${info.color}`}
                        ></i>
                      </span>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Source filter */}
        <div className="relative" ref={sourceRef}>
          <button
            onClick={() => {
              setSourceDropdownOpen(!sourceDropdownOpen);
              setLevelDropdownOpen(false);
            }}
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
      </div>

      {/* Log list */}
      {filteredLogs.length === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center animate-scale-in">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
              <i className="ri-file-search-line text-2xl text-secondary-600"></i>
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
              {logs.length === 0 ? "Нет записей" : "Ничего не найдено"}
            </h3>
            <p className="text-sm text-foreground-500 mb-6">
              {logs.length === 0
                ? "Логи пока отсутствуют. Система начнёт собирать записи после первого деплоя."
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
          <div className="rounded-xl border border-background-200 overflow-hidden">
            <div className="overflow-x-auto">
              {/* Desktop table */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-background-100/70">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide whitespace-nowrap w-[140px]">
                      Время
                    </th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide whitespace-nowrap w-[90px]">
                      Уровень
                    </th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide whitespace-nowrap w-[120px]">
                      Источник
                    </th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide whitespace-nowrap w-[100px]">
                      Сервис
                    </th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-foreground-500 uppercase tracking-wide whitespace-nowrap">
                      Сообщение
                    </th>
                    <th className="w-10 px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLogs.map((log) => {
                    const levelInfo = logLevels[log.level];
                    const isExpanded = expandedId === log.id;

                    return (
                      <tr
                        key={log.id}
                        className={`border-b border-background-100 last:border-b-0 transition-colors ${isExpanded ? "bg-background-100/50" : "hover:bg-background-50"}`}
                      >
                        <td
                          className="px-4 py-3 text-xs text-foreground-500 whitespace-nowrap"
                          title={formatAbsoluteTime(log.timestamp)}
                        >
                          <span className="hidden xl:inline">
                            {formatAbsoluteTime(log.timestamp)}
                          </span>
                          <span className="xl:hidden">
                            {formatRelativeTime(log.timestamp)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${levelInfo.bg} ${levelInfo.color}`}
                          >
                            <i
                              className={`${levelInfo.icon} w-3 h-3 flex items-center justify-center`}
                            ></i>
                            {levelInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-foreground-700 whitespace-nowrap">
                            {log.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-foreground-500 whitespace-nowrap uppercase">
                            {log.service}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground-800 truncate max-w-[400px] xl:max-w-[600px]">
                            {log.message}
                          </p>
                        </td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => toggleExpand(log.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-200/70 transition-colors cursor-pointer"
                            title={isExpanded ? "Свернуть" : "Подробнее"}
                          >
                            {isExpanded ? (
                              <i className="ri-arrow-up-s-line w-4 h-4 flex items-center justify-center"></i>
                            ) : (
                              <i className="ri-arrow-down-s-line w-4 h-4 flex items-center justify-center"></i>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="md:hidden">
                {pagedLogs.map((log) => {
                  const levelInfo = logLevels[log.level];
                  const isExpanded = expandedId === log.id;

                  return (
                    <div
                      key={log.id}
                      className={`border-b border-background-100 last:border-b-0 ${isExpanded ? "bg-background-100/50" : ""}`}
                    >
                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="w-full text-left px-4 py-3 cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap mt-0.5 shrink-0 ${levelInfo.bg} ${levelInfo.color}`}
                          >
                            <i
                              className={`${levelInfo.icon} w-3 h-3 flex items-center justify-center`}
                            ></i>
                            {levelInfo.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground-800 leading-snug line-clamp-2">
                              {log.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs font-medium text-foreground-600">
                                {log.source}
                              </span>
                              <span className="text-[10px] text-foreground-400 uppercase">
                                {log.service}
                              </span>
                              <span className="text-[10px] text-foreground-400 ml-auto">
                                {formatRelativeTime(log.timestamp)}
                              </span>
                            </div>
                          </div>
                          <i
                            className={`${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} w-4 h-4 flex items-center justify-center text-foreground-400 shrink-0 mt-0.5`}
                          ></i>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Expanded detail panels */}
            {pagedLogs.map((log) => {
              const levelInfo = logLevels[log.level];
              if (expandedId !== log.id) return null;
              return (
                <div
                  key={`detail-${log.id}`}
                  className="border-t border-background-200 bg-background-100/40 animate-fade-in"
                >
                  <div className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-[10px] text-foreground-400">
                        {formatAbsoluteTime(log.timestamp)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${levelInfo.bg} ${levelInfo.color}`}
                      >
                        <i
                          className={`${levelInfo.icon} w-3 h-3 flex items-center justify-center`}
                        ></i>
                        {levelInfo.label}
                      </span>
                      <span className="text-xs font-medium text-foreground-700">
                        {log.source}
                      </span>
                      <span className="text-[10px] text-foreground-400 uppercase">
                        {log.service}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-800 mb-3 font-medium">
                      {log.message}
                    </p>
                    {log.details && (
                      <div className="rounded-lg border border-background-200 bg-background-50 p-3 overflow-x-auto">
                        <pre className="text-xs text-foreground-600 font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {log.details}
                        </pre>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `[${formatAbsoluteTime(log.timestamp)}] [${log.level.toUpperCase()}] [${log.source}/${log.service}] ${log.message}\n${log.details}`,
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
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <i className="ri-arrow-left-s-line w-4 h-4 flex items-center justify-center"></i>
                Назад
              </button>
              <span className="text-xs text-foreground-400">
                {safePage} / {totalPages} ({filteredLogs.length} записей)
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
