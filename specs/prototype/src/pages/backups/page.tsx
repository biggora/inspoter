import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  mockBackupSchedules,
  mockBackupHistory,
  backupTypeLabels,
  backupTypeIcons,
  backupTypeColors,
} from '@/mocks/backups';
import type { BackupSchedule, BackupEntry, BackupType, ScheduleStatus } from '@/mocks/backups';

type PageState = 'loading' | 'error' | 'ready';
type TabKey = 'schedule' | 'history';

const PAGE_SIZE = 10;

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins} мин`;
  if (diffHours < 24) return `${diffHours} ч`;
  if (diffDays < 7) return `${diffDays} дн`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatNextRun(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor((diffMs % 3600000) / 60000);

  if (diffMs < 0) return 'Выполняется';
  if (diffHours < 1) return `через ${diffMins} мин`;
  if (diffHours < 24) return `через ${diffHours} ч`;
  const days = Math.floor(diffHours / 24);
  return `через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`;
}

const statusBadge: Record<string, { dot: string; cls: string; label: string }> = {
  active: { dot: 'bg-accent-500', cls: 'text-accent-700 bg-accent-100', label: 'Активно' },
  paused: { dot: 'bg-amber-500', cls: 'text-amber-700 bg-amber-100', label: 'Пауза' },
  completed: { dot: 'bg-accent-500', cls: 'text-accent-700 bg-accent-100', label: 'Завершён' },
  failed: { dot: 'bg-red-500', cls: 'text-red-700 bg-red-100', label: 'Ошибка' },
  in_progress: { dot: 'bg-primary-500', cls: 'text-primary-700 bg-primary-100', label: 'В процессе' },
};

export default function BackupsPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [notification, setNotification] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  // History filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [serverFilter, setServerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Dropdowns
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const serverRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (serverRef.current && !serverRef.current.contains(e.target as Node)) setServerDropdownOpen(false);
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setCurrentPage(1);
  }, []);

  const loadData = useCallback(() => {
    setPageState('loading');
    setTimeout(() => {
      setSchedules(mockBackupSchedules.map((s) => ({ ...s })));
      setHistory(mockBackupHistory.map((h) => ({ ...h })));
      setPageState('ready');
    }, 600);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  const stats = useMemo(() => {
    const activeSchedules = schedules.filter((s) => s.status === 'active').length;
    const now24h = Date.now() - 86400000;
    const last24h = history.filter(
      (h) => h.status === 'completed' && new Date(h.completedAt!).getTime() > now24h
    ).length;
    const totalCompleted = history.filter((h) => h.status === 'completed').length;
    const totalAll = history.filter((h) => h.status !== 'in_progress').length;
    const successRate = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 100;
    const totalSizeStr = '92.4 GB';
    return { activeSchedules, last24h, successRate, totalSizeStr };
  }, [schedules, history]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    let list = [...history].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((h) => h.serverName.toLowerCase().includes(q));
    }
    if (statusFilter) list = list.filter((h) => h.status === statusFilter);
    if (serverFilter) list = list.filter((h) => h.serverName === serverFilter);
    if (typeFilter) list = list.filter((h) => h.type === typeFilter);

    return list;
  }, [history, debouncedSearch, statusFilter, serverFilter, typeFilter]);

  const uniqueServers = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((h) => {
      if (seen.has(h.serverName)) return false;
      seen.add(h.serverName);
      return true;
    }).map((h) => h.serverName);
  }, [history]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedHistory = filteredHistory.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters = !!debouncedSearch || !!statusFilter || !!serverFilter || !!typeFilter;

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('');
    setServerFilter('');
    setTypeFilter('');
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => setCurrentPage(page), []);

  const handleToggleSchedule = useCallback((id: string) => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const newStatus: ScheduleStatus = s.status === 'active' ? 'paused' : 'active';
        setNotification({
          message: `Расписание для «${s.serverName}» ${newStatus === 'active' ? 'активировано' : 'приостановлено'}`,
          variant: 'success',
        });
        return {
          ...s,
          status: newStatus,
          nextRun: newStatus === 'active'
            ? new Date(Date.now() + 3600000 * (6 + Math.random() * 18)).toISOString()
            : '—',
        };
      })
    );
  }, []);

  // Loading skeletons
  if (pageState === 'loading') {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-24 rounded-xl"></div>
          ))}
        </div>
        <div className="flex gap-1 mb-5">
          <div className="animate-skeleton h-9 w-28 rounded-full"></div>
          <div className="animate-skeleton h-9 w-28 rounded-full"></div>
        </div>
        <div className="animate-skeleton h-96 rounded-xl"></div>
      </div>
    );
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-hard-drive-3-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Не удалось загрузить бэкапы</h3>
          <p className="text-sm text-foreground-500 mb-6">Проверьте подключение к хранилищу и попробуйте снова.</p>
          <button
            onClick={loadData}
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
            notification.variant === 'success'
              ? 'bg-accent-100/80 text-accent-800'
              : 'bg-primary-100/70 text-primary-800'
          }`}
          role="status" aria-live="polite"
        >
          <i className={`${notification.variant === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} w-5 h-5 flex items-center justify-center`}></i>
          {notification.message}
        </div>
      )}

      {/* ===== STATS CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Active schedules */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-calendar-check-line text-sm text-accent-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Расписания</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">
            {stats.activeSchedules}<span className="text-base text-foreground-400 font-normal">/{schedules.length}</span>
          </p>
          <p className="text-[11px] text-foreground-400 mt-0.5">активных</p>
        </div>

        {/* Last 24h backups */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
              <i className="ri-history-line text-sm text-primary-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">За 24 часа</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.last24h}</p>
          <p className="text-[11px] text-foreground-400 mt-0.5">завершённых бэкапов</p>
        </div>

        {/* Storage used */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center">
              <i className="ri-hard-drive-2-line text-sm text-secondary-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Хранилище</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.totalSizeStr}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-background-200 overflow-hidden">
              <div className="h-full rounded-full bg-secondary-500" style={{ width: '34%' }}></div>
            </div>
            <span className="text-[10px] text-foreground-400">34%</span>
          </div>
        </div>

        {/* Success rate */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-check-double-line text-sm text-accent-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Успешность</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.successRate}%</p>
          <p className="text-[11px] text-foreground-400 mt-0.5">за последние 30 дней</p>
        </div>
      </div>

      {/* ===== TAB SWITCHER ===== */}
      <div className="flex items-center justify-between mb-5">
        <div className="inline-flex items-center rounded-full border border-background-200 bg-background-50 p-1">
          <button
            onClick={() => { setActiveTab('schedule'); setCurrentPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'schedule' ? 'bg-primary-500 text-background-50' : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            <i className="ri-calendar-2-line w-4 h-4 mr-1.5 inline-flex items-center justify-center align-middle"></i>
            Расписание
          </button>
          <button
            onClick={() => { setActiveTab('history'); setCurrentPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'history' ? 'bg-primary-500 text-background-50' : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            <i className="ri-archive-line w-4 h-4 mr-1.5 inline-flex items-center justify-center align-middle"></i>
            История
          </button>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

      {/* ===== SCHEDULE TAB ===== */}
      {activeTab === 'schedule' && (
        <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-200 bg-background-100/50">
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Сервер</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Тип</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Частота</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Хранение</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">След. запуск</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Последний</th>
                  <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Размер</th>
                  <th className="text-center py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Статус</th>
                  <th className="text-right py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((sch) => {
                  const sb = statusBadge[sch.status];
                  return (
                    <tr key={sch.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-secondary-100 flex items-center justify-center shrink-0">
                            <i className="ri-server-line text-xs text-secondary-600"></i>
                          </div>
                          <span className="text-xs font-medium text-foreground-900 whitespace-nowrap">{sch.serverName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${backupTypeColors[sch.type]}`}>
                          <i className={`${backupTypeIcons[sch.type]} w-3 h-3 flex items-center justify-center`}></i>
                          {backupTypeLabels[sch.type]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs text-foreground-700 whitespace-nowrap">{sch.frequency}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs text-foreground-600 whitespace-nowrap">{sch.retention}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {sch.nextRun === '—' ? (
                          <span className="text-xs text-foreground-400">—</span>
                        ) : (
                          <div>
                            <p className="text-xs font-medium text-foreground-700 whitespace-nowrap">{formatNextRun(sch.nextRun)}</p>
                            <p className="text-[10px] text-foreground-400">{formatAbsoluteTime(sch.nextRun)}</p>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {sch.lastRun ? (
                          <p className="text-xs text-foreground-600 whitespace-nowrap">{formatRelativeTime(sch.lastRun)}</p>
                        ) : (
                          <span className="text-xs text-foreground-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs font-mono text-foreground-700 whitespace-nowrap">{sch.lastSize || '—'}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${sb.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sb.dot}`}></span>
                          {sb.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleSchedule(sch.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            sch.status === 'active'
                              ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-accent-600 hover:text-accent-700 hover:bg-accent-50'
                          }`}
                        >
                          <i className={`${sch.status === 'active' ? 'ri-pause-circle-line' : 'ri-play-circle-line'} w-4 h-4 flex items-center justify-center`}></i>
                          {sch.status === 'active' ? 'Пауза' : 'Запустить'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === 'history' && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400 w-5 h-5 flex items-center justify-center"></i>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Поиск по имени сервера..."
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

            {/* Status filter - segmented */}
            <div className="inline-flex items-center rounded-full border border-background-200 bg-background-50 p-1">
              {[
                { key: '', label: 'Все' },
                { key: 'completed', label: 'Завершён' },
                { key: 'failed', label: 'Ошибка' },
                { key: 'in_progress', label: 'В процессе' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setStatusFilter(opt.key); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === opt.key ? 'bg-primary-500 text-background-50' : 'text-foreground-500 hover:text-foreground-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Server filter */}
            <div className="relative" ref={serverRef}>
              <button
                onClick={() => setServerDropdownOpen(!serverDropdownOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap border ${
                  serverFilter
                    ? 'border-primary-300 bg-primary-50 text-primary-700'
                    : 'border-background-200 text-foreground-500 hover:text-foreground-700 hover:border-background-300'
                }`}
              >
                <i className="ri-server-line w-4 h-4 flex items-center justify-center"></i>
                {serverFilter || 'Сервер'}
                <i className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${serverDropdownOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {serverDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-52 bg-background-50 border border-background-200 rounded-lg shadow-lg animate-scale-in overflow-hidden">
                  <div className="max-h-52 overflow-y-auto py-1">
                    <button
                      onClick={() => { setServerFilter(''); setServerDropdownOpen(false); setCurrentPage(1); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${!serverFilter ? 'bg-primary-50 text-primary-700' : 'text-foreground-700 hover:bg-background-100'}`}
                    >
                      Все серверы ({uniqueServers.length})
                    </button>
                    {uniqueServers.map((name) => (
                      <button
                        key={name}
                        onClick={() => { setServerFilter(name); setServerDropdownOpen(false); setCurrentPage(1); }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center justify-between ${serverFilter === name ? 'bg-primary-50 text-primary-700' : 'text-foreground-700 hover:bg-background-100'}`}
                      >
                        <span className="truncate">{name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Type filter */}
            <div className="relative" ref={typeRef}>
              <button
                onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap border ${
                  typeFilter
                    ? 'border-primary-300 bg-primary-50 text-primary-700'
                    : 'border-background-200 text-foreground-500 hover:text-foreground-700 hover:border-background-300'
                }`}
              >
                <i className="ri-git-branch-line w-4 h-4 flex items-center justify-center"></i>
                {typeFilter ? backupTypeLabels[typeFilter as BackupType] : 'Тип'}
                <i className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${typeDropdownOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {typeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-44 bg-background-50 border border-background-200 rounded-lg shadow-lg animate-scale-in overflow-hidden">
                  <div className="py-1">
                    <button
                      onClick={() => { setTypeFilter(''); setTypeDropdownOpen(false); setCurrentPage(1); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${!typeFilter ? 'bg-primary-50 text-primary-700' : 'text-foreground-700 hover:bg-background-100'}`}
                    >
                      Все типы
                    </button>
                    {(['full', 'incremental', 'database'] as BackupType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTypeFilter(t); setTypeDropdownOpen(false); setCurrentPage(1); }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2 ${typeFilter === t ? 'bg-primary-50 text-primary-700' : 'text-foreground-700 hover:bg-background-100'}`}
                      >
                        <i className={`${backupTypeIcons[t]} w-4 h-4 flex items-center justify-center`}></i>
                        {backupTypeLabels[t]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

          {/* History table */}
          {filteredHistory.length === 0 ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <div className="text-center animate-scale-in">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
                  <i className="ri-archive-line text-2xl text-secondary-600"></i>
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
                  {history.length === 0 ? 'Нет записей' : 'Ничего не найдено'}
                </h3>
                <p className="text-sm text-foreground-500 mb-6">
                  {history.length === 0
                    ? 'История бэкапов пока пуста. Записи появятся после первого выполнения.'
                    : 'Попробуйте изменить параметры поиска или сбросить фильтры.'}
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
            <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-background-200 bg-background-100/50">
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Сервер</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Тип</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Статус</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Начало</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Длительность</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Размер</th>
                      <th className="text-left py-3 px-4 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Расположение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedHistory.map((entry) => {
                      const eb = statusBadge[entry.status];
                      return (
                        <tr key={entry.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-md bg-secondary-100 flex items-center justify-center shrink-0">
                                <i className="ri-server-line text-xs text-secondary-600"></i>
                              </div>
                              <span className="text-xs font-medium text-foreground-900 whitespace-nowrap">{entry.serverName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${backupTypeColors[entry.type]}`}>
                              <i className={`${backupTypeIcons[entry.type]} w-3 h-3 flex items-center justify-center`}></i>
                              {backupTypeLabels[entry.type]}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${eb.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${eb.dot} ${entry.status === 'in_progress' ? 'animate-pulse' : ''}`}></span>
                                {eb.label}
                              </span>
                              {entry.errorMessage && (
                                <p className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={entry.errorMessage}>
                                  {entry.errorMessage}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="text-xs text-foreground-700 whitespace-nowrap">{formatRelativeTime(entry.startedAt)}</p>
                              <p className="text-[10px] text-foreground-400">{formatAbsoluteTime(entry.startedAt)}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-mono text-foreground-700 whitespace-nowrap">{entry.duration}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-mono text-foreground-700 whitespace-nowrap">{entry.size}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-foreground-500 whitespace-nowrap">{entry.location}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5">
              <button
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <i className="ri-arrow-left-s-line w-4 h-4 flex items-center justify-center"></i>
                Назад
              </button>
              <span className="text-xs text-foreground-400">
                {safePage} / {totalPages} ({filteredHistory.length} записей)
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