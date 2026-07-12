import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mockEmails } from '@/mocks/emails';
import type { Email } from '@/mocks/emails';

const PAGE_SIZE = 10;

type PageState = 'loading' | 'error' | 'ready';

interface NotificationState {
  message: string;
  variant: 'success' | 'error';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин`;
  if (diffHours < 24) return `${diffHours} ч`;
  if (diffDays < 7) return `${diffDays} дн`;

  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function MailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [paginating, setPaginating] = useState(false);

  // URL params
  const query = searchParams.get('q') || '';
  const senderFilter = searchParams.get('sender') || '';
  const sortOrder = (searchParams.get('sort') || 'newest') as 'newest' | 'oldest';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // Debounced search input
  const [searchInput, setSearchInput] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Update URL search param helper
  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        if (key !== 'page') next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setParam('q', value);
      }, 300);
    },
    [setParam]
  );

  // Reset search
  const clearSearch = useCallback(() => {
    setSearchInput('');
    setParam('q', '');
  }, [setParam]);

  // Filter & sort
  const handleSenderFilter = useCallback(
    (sender: string) => {
      setParam('sender', sender);
      setFilterDropdownOpen(false);
    },
    [setParam]
  );

  const clearSenderFilter = useCallback(() => {
    setParam('sender', '');
  }, [setParam]);

  const toggleSort = useCallback(() => {
    setParam('sort', sortOrder === 'newest' ? 'oldest' : 'newest');
  }, [setParam, sortOrder]);

  // Pagination
  const goToPage = useCallback(
    (page: number) => {
      setParam('page', String(page));
      setSelectedEmail(null);
    },
    [setParam]
  );

  // Load emails
  const loadEmails = useCallback(() => {
    setPageState('loading');
    setSelectedEmail(null);
    setTimeout(() => {
      const shouldFail = false;
      if (shouldFail) {
        setPageState('error');
      } else {
        setEmails(mockEmails.map((e) => ({ ...e })));
        setPageState('ready');
      }
    }, 600);
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  // Filter and sort
  const filteredEmails = useMemo(() => {
    let list = [...emails];

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.fromName.toLowerCase().includes(q) ||
          e.from.toLowerCase().includes(q)
      );
    }

    if (senderFilter) {
      list = list.filter((e) => e.from === senderFilter);
    }

    list.sort((a, b) => {
      const da = new Date(a.receivedAt).getTime();
      const db = new Date(b.receivedAt).getTime();
      return sortOrder === 'newest' ? db - da : da - db;
    });

    return list;
  }, [emails, query, senderFilter, sortOrder]);

  // Unique senders for filter dropdown
  const uniqueSenders = useMemo(() => {
    const seen = new Set<string>();
    return emails.filter((e) => {
      if (seen.has(e.from)) return false;
      seen.add(e.from);
      return true;
    });
  }, [emails]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedEmails = filteredEmails.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters = !!query || !!senderFilter || sortOrder !== 'newest';

  // Loading
  if (pageState === 'loading') {
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left panel skeletons */}
        <div className="w-full md:w-[420px] md:min-w-[420px] border-r border-background-200 flex flex-col bg-background-50">
          <div className="p-4 border-b border-background-100">
            <div className="animate-skeleton h-9 rounded-lg"></div>
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="px-4 py-3 border-b border-background-50">
              <div className="flex items-center gap-3">
                <div className="animate-skeleton w-8 h-8 rounded-full shrink-0"></div>
                <div className="flex-1 space-y-1.5">
                  <div className="animate-skeleton h-3.5 w-32 rounded"></div>
                  <div className="animate-skeleton h-3 w-56 rounded"></div>
                </div>
                <div className="animate-skeleton h-3 w-10 rounded shrink-0"></div>
              </div>
            </div>
          ))}
        </div>
        {/* Right panel skeleton */}
        <div className="hidden md:flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-foreground-400 animate-pulse">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Error
  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-mail-close-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Не удалось загрузить почту</h3>
          <p className="text-sm text-foreground-500 mb-6">
            Проверьте подключение к почтовому серверу и попробуйте снова.
          </p>
          <button
            onClick={loadEmails}
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
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === 'success'
              ? 'bg-accent-100/80 text-accent-800'
              : 'bg-primary-100/70 text-primary-800'
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${notification.variant === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      {/* ===== LEFT PANEL — Email list ===== */}
      <div className={`${selectedEmail ? 'hidden md:flex' : 'flex'} md:flex w-full md:w-[420px] md:min-w-[420px] border-r border-background-200 flex-col bg-background-50`}>
        {/* Search & Filters */}
        <div className="p-3 border-b border-background-100 space-y-2">
          {/* Search bar */}
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Поиск по теме или отправителю..."
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

          {/* Filter & Sort row */}
          <div className="flex items-center gap-2">
            {/* Sender filter dropdown */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  senderFilter
                    ? 'bg-primary-100/70 text-primary-700'
                    : 'text-foreground-500 hover:text-foreground-700 hover:bg-background-100'
                }`}
              >
                <i className="ri-filter-3-line w-4 h-4 flex items-center justify-center"></i>
                {senderFilter
                  ? uniqueSenders.find((e) => e.from === senderFilter)?.fromName || senderFilter
                  : 'Отправитель'}
                <i className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${filterDropdownOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {filterDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-64 bg-background-50 border border-background-200 rounded-lg shadow-lg animate-scale-in overflow-hidden">
                  <div className="max-h-56 overflow-y-auto py-1">
                    {uniqueSenders.map((e) => (
                      <button
                        key={e.from}
                        onClick={() => handleSenderFilter(e.from)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                          senderFilter === e.from
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-foreground-700 hover:bg-background-100'
                        }`}
                      >
                        <div className="font-medium text-xs">{e.fromName}</div>
                        <div className="text-xs text-foreground-400">{e.from}</div>
                      </button>
                    ))}
                    {senderFilter && (
                      <button
                        onClick={clearSenderFilter}
                        className="w-full text-left px-3 py-2 text-sm text-primary-600 hover:bg-background-100 transition-colors cursor-pointer border-t border-background-100"
                      >
                        Сбросить фильтр
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sort toggle */}
            <button
              onClick={toggleSort}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className={`${sortOrder === 'newest' ? 'ri-sort-desc' : 'ri-sort-asc'} w-4 h-4 flex items-center justify-center`}></i>
              {sortOrder === 'newest' ? 'Сначала новые' : 'Сначала старые'}
            </button>
          </div>

          {/* Active filters bar */}
          {hasActiveFilters && filteredEmails.length === 0 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-foreground-400">Ничего не найдено</span>
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchParams({});
                }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {filteredEmails.length === 0 && !hasActiveFilters ? (
            /* Empty state — no emails at all */
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center animate-scale-in">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary-100 flex items-center justify-center">
                  <i className="ri-mail-line text-xl text-secondary-600"></i>
                </div>
                <h4 className="font-heading font-semibold text-sm text-foreground-900 mb-1">Нет писем</h4>
                <p className="text-xs text-foreground-500">Входящие пока пусты</p>
              </div>
            </div>
          ) : filteredEmails.length === 0 && hasActiveFilters ? (
            /* No results from filters */
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center animate-scale-in">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary-100 flex items-center justify-center">
                  <i className="ri-mail-close-line text-xl text-secondary-600"></i>
                </div>
                <h4 className="font-heading font-semibold text-sm text-foreground-900 mb-1">Ничего не найдено</h4>
                <p className="text-xs text-foreground-500 mb-4">Попробуйте изменить или сбросить фильтры</p>
                <button
                  onClick={() => {
                    setSearchInput('');
                    setSearchParams({});
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
                  Сбросить фильтры
                </button>
              </div>
            </div>
          ) : (
            <>
              {pagedEmails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      navigate(`/mail/${email.id}?${searchParams.toString()}`);
                    } else {
                      setSelectedEmail(email);
                      if (!email.isRead) {
                        setEmails((prev) =>
                          prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
                        );
                      }
                    }
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-background-50 hover:bg-background-100/60 transition-colors cursor-pointer ${
                    selectedEmail?.id === email.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-background-50"
                      style={{ backgroundColor: stringToColor(email.fromName) }}
                    >
                      {getInitials(email.fromName)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${email.isRead ? 'text-foreground-600' : 'text-foreground-900 font-semibold'}`}>
                          {email.fromName}
                        </span>
                        <span className="text-xs text-foreground-400 whitespace-nowrap shrink-0">
                          {formatDate(email.receivedAt)}
                        </span>
                      </div>
                      <p className={`text-sm truncate mt-0.5 ${email.isRead ? 'text-foreground-500' : 'text-foreground-800 font-medium'}`}>
                        {email.subject}
                      </p>
                      <p className="text-xs text-foreground-400 truncate mt-0.5">
                        {stripHtml(email.bodyHtml).slice(0, 80)}
                      </p>
                    </div>
                    {!email.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-1.5"></div>
                    )}
                  </div>
                </button>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-background-100 bg-background-50 sticky bottom-0">
                  <button
                    onClick={() => goToPage(safePage - 1)}
                    disabled={safePage <= 1 || paginating}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <i className="ri-arrow-left-s-line w-4 h-4 flex items-center justify-center"></i>
                    Назад
                  </button>
                  <span className="text-xs text-foreground-400">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => goToPage(safePage + 1)}
                    disabled={safePage >= totalPages || paginating}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Вперёд
                    <i className="ri-arrow-right-s-line w-4 h-4 flex items-center justify-center"></i>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== RIGHT PANEL — Email detail ===== */}
      <div className={`${selectedEmail ? 'flex' : 'hidden'} md:flex flex-1 flex-col bg-background-50 overflow-y-auto`}>
        {selectedEmail ? (
          <div className="animate-fade-in">
            {/* Email header */}
            <div className="px-6 py-5 border-b border-background-100">
              <h2 className="font-heading text-lg font-semibold text-foreground-900 mb-3">{selectedEmail.subject}</h2>
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold text-background-50"
                  style={{ backgroundColor: stringToColor(selectedEmail.fromName) }}
                >
                  {getInitials(selectedEmail.fromName)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground-900">{selectedEmail.fromName}</p>
                  <p className="text-xs text-foreground-400">{selectedEmail.from}</p>
                  <p className="text-xs text-foreground-400 mt-0.5">{formatTime(selectedEmail.receivedAt)}</p>
                </div>
              </div>
            </div>
            {/* Email body */}
            <div
              className="px-6 py-5 text-sm text-foreground-800 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
                <i className="ri-mail-open-line text-2xl text-secondary-500"></i>
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground-900 mb-1">Выберите письмо</h3>
              <p className="text-sm text-foreground-400">
                {filteredEmails.length > 0
                  ? 'Нажмите на письмо слева, чтобы прочитать его'
                  : 'Писем пока нет'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Utility: generate consistent color from string
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.55 0.18 ${hue})`;
}

// Utility: strip HTML tags for preview text
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}