import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const LOGOUT_FLAG_KEY = 'inspot_logged_out';
const SIDEBAR_COLLAPSED_KEY = 'inspot_sidebar_collapsed';

const mainNavItems: NavItem[] = [
  { path: '/', label: 'Дашборд', icon: 'ri-home-line' },
  { path: '/bookmarks', label: 'Закладки', icon: 'ri-bookmark-line' },
  { path: '/domains', label: 'Домены', icon: 'ri-global-line' },
  { path: '/servers', label: 'Серверы', icon: 'ri-server-line' },
  { path: '/monitoring', label: 'Мониторинг', icon: 'ri-dashboard-line' },
  { path: '/backups', label: 'Бэкапы', icon: 'ri-hard-drive-3-line' },
  { path: '/mail', label: 'Почта', icon: 'ri-mail-line' },
  { path: '/messages', label: 'Сообщения', icon: 'ri-message-2-line' },
  { path: '/logs', label: 'Логи', icon: 'ri-file-list-3-line' },
  { path: '/alerts', label: 'Оповещения', icon: 'ri-alert-line' },
];

const bottomNavItem: NavItem = {
  path: '/settings',
  label: 'Настройки',
  icon: 'ri-settings-4-line',
};

const pageTitles: Record<string, string> = {
  '/': 'Дашборд',
  '/bookmarks': 'Закладки',
  '/domains': 'Домены',
  '/servers': 'Серверы',
  '/monitoring': 'Мониторинг',
  '/backups': 'Бэкапы',
  '/mail': 'Почта',
  '/messages': 'Сообщения',
  '/logs': 'Логи',
  '/alerts': 'Оповещения',
  '/settings': 'Настройки',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const currentPath = location.pathname;
  const pageTitle = pageTitles[currentPath] || 'Панель';

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false);
    setSidebarOpen(false);
    try {
      localStorage.setItem(LOGOUT_FLAG_KEY, '1');
    } catch {
      // ignore
    }
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    if (sidebarOpen) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setSidebarOpen(false);
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPath]);

  const isActive = (path: string) => currentPath === path;

  const navLinkClass = (path: string) =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
      collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
    } ${
      isActive(path)
        ? 'bg-primary-100 text-primary-700'
        : 'text-foreground-600 hover:bg-background-100 hover:text-foreground-900'
    }`;

  const renderNavItem = (item: NavItem) => (
    <Link key={item.path} to={item.path} className={`group ${navLinkClass(item.path)}`}>
      <div className="relative flex items-center justify-center">
        <i className={`${item.icon} w-5 h-5 flex items-center justify-center`}></i>
        {collapsed && (
          <span className="absolute left-full ml-3 px-2.5 py-1 rounded-md bg-foreground-900 text-background-50 text-xs font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-[60]">
            {item.label}
          </span>
        )}
      </div>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  return (
    <div className="min-h-screen flex bg-background-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-background-50 border-r border-background-200 flex flex-col transition-all duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-16' : 'w-64'}`}
        role="navigation"
        aria-label="Основная навигация"
      >
        <div className={`flex items-center justify-between px-4 h-14 border-b border-background-200 shrink-0 ${collapsed ? 'px-2 justify-center' : ''}`}>
          {collapsed ? (
            <Link to="/" className="w-8 h-8 flex items-center justify-center rounded-md bg-primary-100 no-underline shrink-0" title="Inspot">
              <span className="text-sm font-bold text-primary-700">In</span>
            </Link>
          ) : (
            <Link to="/bookmarks" className="font-heading text-lg font-bold text-foreground-900 no-underline">
              Inspot
            </Link>
          )}
          {!collapsed && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer"
              aria-label="Закрыть меню"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {mainNavItems.map((item) => renderNavItem(item))}
        </nav>

        <div className={`py-3 border-t border-background-200 ${collapsed ? 'px-2' : 'px-3'}`}>
          {renderNavItem(bottomNavItem)}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-background-50 border-b border-background-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer"
              aria-label="Открыть меню"
            >
              <i className="ri-menu-line text-lg"></i>
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex w-8 h-8 items-center justify-center rounded-md text-foreground-500 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer"
              aria-label={collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
              title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            >
              <i className={`text-lg ${collapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'}`}></i>
            </button>
            <h2 className="font-heading text-base font-semibold text-foreground-900">{pageTitle}</h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer"
              aria-label={resolvedTheme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            >
              <i className={`text-lg ${resolvedTheme === 'dark' ? 'ri-sun-line' : 'ri-moon-line'}`}></i>
            </button>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary-700">A</span>
                </div>
                <span className="hidden sm:inline font-medium">admin</span>
                <i className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center text-foreground-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}></i>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-background-200 bg-background-50 py-1 shadow-lg animate-scale-in z-20">
                    <div className="px-3 py-2 border-b border-background-100">
                      <p className="text-sm font-medium text-foreground-900">admin</p>
                      <p className="text-xs text-foreground-500">Оператор</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-logout-box-r-line w-5 h-5 flex items-center justify-center"></i>
                      Выйти
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}