import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockServers } from '@/mocks/servers';
import { mockDomains } from '@/mocks/domains';
import { mockAlerts } from '@/mocks/alerts';
import type { AlertEntry } from '@/mocks/alerts';
import { mockEmails } from '@/mocks/emails';
import { initialBookmarks, initialCategories } from '@/mocks/bookmarks';
import { mockBackupHistory, backupTypeLabels, backupTypeIcons, backupTypeColors } from '@/mocks/backups';
import StatCard from './components/StatCard';

type PageState = 'loading' | 'error' | 'ready';

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins}м`;
  if (diffHours < 24) return `${diffHours}ч`;
  if (diffDays < 7) return `${diffDays}дн`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const severityColors: Record<string, { dot: string; text: string; bg: string; icon: string }> = {
  critical: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-100', icon: 'ri-close-circle-fill' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-100', icon: 'ri-alert-fill' },
  info: { dot: 'bg-accent-500', text: 'text-accent-700', bg: 'bg-accent-100', icon: 'ri-information-fill' },
};

const statusInfoMap: Record<string, { dot: string; label: string; cls: string }> = {
  online: { dot: 'bg-accent-500', label: 'Онлайн', cls: 'text-accent-700 bg-accent-100' },
  degraded: { dot: 'bg-amber-500', label: 'Деградация', cls: 'text-amber-700 bg-amber-100' },
  offline: { dot: 'bg-red-500', label: 'Офлайн', cls: 'text-red-700 bg-red-100' },
};

function WidgetHeader({ icon, title, count, linkTo, linkLabel }: {
  icon: string;
  title: string;
  count?: number;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center">
          <i className={`${icon} text-sm text-secondary-600`}></i>
        </div>
        <h3 className="font-heading text-sm font-semibold text-foreground-900">{title}</h3>
        {count !== undefined && (
          <span className="text-xs text-foreground-400">({count})</span>
        )}
      </div>
      <Link
        to={linkTo}
        className="inline-flex items-center gap-1 text-xs font-medium text-foreground-400 hover:text-foreground-700 transition-colors whitespace-nowrap"
      >
        {linkLabel}
        <i className="ri-arrow-right-line w-4 h-4 flex items-center justify-center"></i>
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const [pageState, setPageState] = useState<PageState>('loading');

  const loadData = useCallback(() => {
    setPageState('loading');
    setTimeout(() => setPageState('ready'), 500);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => ({
    serversOnline: mockServers.filter((s) => s.status === 'running').length,
    serversTotal: mockServers.length,
    domainsActive: mockDomains.filter((d) => d.status === 'active').length,
    domainsTotal: mockDomains.length,
    alertsUnack: mockAlerts.filter((a) => !a.acknowledged).length,
    alertsCritical: mockAlerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length,
    alertsWarning: mockAlerts.filter((a) => a.severity === 'warning' && !a.acknowledged).length,
    alertsInfo: mockAlerts.filter((a) => a.severity === 'info' && !a.acknowledged).length,
    emailsUnread: mockEmails.filter((e) => !e.isRead).length,
    emailsTotal: mockEmails.length,
    domainsExpiringCount: mockDomains.filter((d) => {
      const exp = new Date(d.expiresAt).getTime();
      const now = Date.now();
      const daysLeft = (exp - now) / 86400000;
      return daysLeft > 0 && daysLeft < 60;
    }).length,
  }), []);

  const recentCriticalAlerts = useMemo(() => {
    return mockAlerts
      .filter((a) => a.severity === 'critical' || a.severity === 'warning')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, []);

  const recentEmails = useMemo(() => {
    return [...mockEmails]
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, 6);
  }, []);

  const domainsWithHealth = useMemo(() => {
    return mockDomains.map((d) => {
      const exp = new Date(d.expiresAt).getTime();
      const now = Date.now();
      const daysLeft = Math.ceil((exp - now) / 86400000);
      let health: 'good' | 'warning' | 'critical' = 'good';
      if (daysLeft <= 0 || d.status === 'expired') health = 'critical';
      else if (daysLeft < 30) health = 'warning';
      else if (d.status === 'pending' || d.status === 'transferred') health = 'warning';
      return { ...d, daysLeft, health };
    }).sort((a, b) => {
      const order = { critical: 0, warning: 1, good: 2 };
      return order[a.health] - order[b.health];
    });
  }, []);

  const quickBookmarks = useMemo(() => {
    return initialBookmarks.slice(0, 8);
  }, []);

  const recentBackups = useMemo(() => {
    return mockBackupHistory
      .filter((b) => b.status === 'completed' || b.status === 'failed')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 4);
  }, []);

  if (pageState === 'loading') {
    return (
      <div className="p-6">
        <div className="mb-6">
          <div className="animate-skeleton h-8 w-48 rounded-lg mb-1"></div>
          <div className="animate-skeleton h-4 w-72 rounded"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-28 rounded-xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="animate-skeleton h-80 rounded-xl"></div>
          <div className="animate-skeleton h-80 rounded-xl"></div>
        </div>
        <div className="animate-skeleton h-44 rounded-xl mb-5"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="animate-skeleton h-80 rounded-xl"></div>
          <div className="animate-skeleton h-80 rounded-xl"></div>
        </div>
        <div className="animate-skeleton h-48 rounded-xl"></div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-home-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Не удалось загрузить дашборд</h3>
          <p className="text-sm text-foreground-500 mb-6">Проверьте подключение и попробуйте снова.</p>
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
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground-950">Дашборд</h2>
          <p className="text-xs text-foreground-400 mt-0.5">
            Обзорное состояние всей инфраструктуры Inspot
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground-400 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Servers */}
        <StatCard
          icon="ri-server-line"
          label="Серверы"
          value={<>{stats.serversOnline}<span className="text-base text-foreground-400 font-normal">/{stats.serversTotal}</span></>}
          subtitle="в сети"
          accent="accent"
          onClick={() => window.REACT_APP_NAVIGATE?.('/servers')}
        >
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[11px] text-accent-600">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
              {stats.serversOnline} online
            </span>
            {stats.serversTotal - stats.serversOnline > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-foreground-400">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground-300"></span>
                {stats.serversTotal - stats.serversOnline} off
              </span>
            )}
          </div>
        </StatCard>

        {/* Domains */}
        <StatCard
          icon="ri-global-line"
          label="Домены"
          value={<>{stats.domainsActive}<span className="text-base text-foreground-400 font-normal">/{stats.domainsTotal}</span></>}
          subtitle="активны"
          accent="primary"
          onClick={() => window.REACT_APP_NAVIGATE?.('/domains')}
        >
          {stats.domainsExpiringCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                <i className="ri-timer-line text-[10px] text-amber-600"></i>
              </span>
              <span className="text-[11px] text-amber-700 font-medium">
                {stats.domainsExpiringCount} истекают
              </span>
            </div>
          )}
        </StatCard>

        {/* Alerts */}
        <StatCard
          icon="ri-alert-line"
          label="Оповещения"
          value={stats.alertsUnack}
          subtitle="не подтверждены"
          accent={stats.alertsCritical > 0 ? 'red' : 'amber'}
          onClick={() => window.REACT_APP_NAVIGATE?.('/alerts')}
        >
          <div className="flex items-center gap-3 mt-2">
            {stats.alertsCritical > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                {stats.alertsCritical} крит.
              </span>
            )}
            {stats.alertsWarning > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                {stats.alertsWarning} пред.
              </span>
            )}
          </div>
        </StatCard>

        {/* Email */}
        <StatCard
          icon="ri-mail-line"
          label="Почта"
          value={<>{stats.emailsUnread}<span className="text-base text-foreground-400 font-normal">/{stats.emailsTotal}</span></>}
          subtitle="не прочитано"
          accent="secondary"
          onClick={() => window.REACT_APP_NAVIGATE?.('/mail')}
        >
          <div className="flex items-center gap-1.5 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-background-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-secondary-500"
                style={{ width: `${stats.emailsTotal > 0 ? ((stats.emailsTotal - stats.emailsUnread) / stats.emailsTotal) * 100 : 0}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-foreground-400">
              {stats.emailsTotal > 0 ? Math.round(((stats.emailsTotal - stats.emailsUnread) / stats.emailsTotal) * 100) : 0}%
            </span>
          </div>
        </StatCard>
      </div>

      {/* ===== WIDGETS 2x2 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Server status widget */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <WidgetHeader
            icon="ri-server-line"
            title="Состояние серверов"
            count={stats.serversTotal}
            linkTo="/servers"
            linkLabel="Все серверы"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-100">
                  <th className="text-left py-2.5 pr-3 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Сервер</th>
                  <th className="text-left py-2.5 pr-3 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">Статус</th>
                  <th className="text-right py-2.5 pr-3 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">CPU</th>
                  <th className="text-right py-2.5 text-[11px] font-medium text-foreground-400 uppercase tracking-wide whitespace-nowrap">RAM</th>
                </tr>
              </thead>
              <tbody>
                {mockServers.map((server) => {
                  const isRunning = server.status === 'running';
                  const statusLabel = isRunning ? 'Онлайн' : 'Остановлен';
                  const statusCls = isRunning
                    ? 'text-accent-700 bg-accent-100'
                    : 'text-foreground-400 bg-background-100';

                  return (
                    <tr key={server.id} className="border-b border-background-100 last:border-0 hover:bg-background-100/40 transition-colors">
                      <td className="py-3 pr-3">
                        <p className="text-xs font-medium text-foreground-900 whitespace-nowrap">{server.name}</p>
                        <p className="text-[10px] text-foreground-400">{server.location}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${statusCls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-accent-500' : 'bg-foreground-300'}`}></span>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className="text-xs font-medium text-foreground-700">{server.cpu}</span>
                      </td>
                      <td className="py-3 text-right">
                        <span className="text-xs font-medium text-foreground-700">{server.ram}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent alerts widget */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <WidgetHeader
            icon="ri-alert-line"
            title="Последние оповещения"
            count={stats.alertsUnack}
            linkTo="/alerts"
            linkLabel="Все оповещения"
          />
          {recentCriticalAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center mb-3">
                <i className="ri-check-line text-lg text-accent-600"></i>
              </div>
              <p className="text-sm text-foreground-500">Нет активных оповещений</p>
              <p className="text-[11px] text-foreground-400 mt-0.5">Все системы работают штатно</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentCriticalAlerts.map((alert) => {
                const sev = severityColors[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                      alert.acknowledged
                        ? 'hover:bg-background-100/40'
                        : 'bg-background-100/60 hover:bg-background-200/50 border-l-[3px]'
                    }`}
                    style={!alert.acknowledged ? { borderLeftColor: alert.severity === 'critical' ? 'oklch(0.55 0.19 30)' : 'oklch(0.62 0.16 70)' } : undefined}
                    onClick={() => window.REACT_APP_NAVIGATE?.('/alerts')}
                  >
                    <div className={`w-7 h-7 rounded-md ${sev.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <i className={`${sev.icon} text-xs ${sev.text}`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground-900 truncate">{alert.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-foreground-500">{alert.source}</span>
                        <span className="text-[10px] text-foreground-400">{formatRelativeTime(alert.timestamp)}</span>
                        {!alert.acknowledged && (
                          <span className={`text-[10px] font-medium ${sev.text}`}>Не подтверждено</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== RECENT BACKUPS WIDGET ===== */}
      <div className="rounded-xl border border-background-200 bg-background-50 p-5 mb-5">
        <WidgetHeader
          icon="ri-hard-drive-3-line"
          title="Последние бэкапы"
          count={recentBackups.length}
          linkTo="/backups"
          linkLabel="Все бэкапы"
        />
        {recentBackups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center mb-3">
              <i className="ri-hard-drive-3-line text-lg text-accent-600"></i>
            </div>
            <p className="text-sm text-foreground-500">Нет завершённых бэкапов</p>
            <p className="text-[11px] text-foreground-400 mt-0.5">Расписания бэкапов можно настроить в разделе Бэкапы</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentBackups.map((backup) => {
              const typeLabel = backupTypeLabels[backup.type];
              const typeIcon = backupTypeIcons[backup.type];
              const typeColor = backupTypeColors[backup.type];
              const isFailed = backup.status === 'failed';
              const isCompleted = backup.status === 'completed';

              return (
                <div
                  key={backup.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border border-background-200 hover:border-background-300 hover:bg-background-100/50 transition-colors cursor-pointer group"
                  onClick={() => window.REACT_APP_NAVIGATE?.('/backups')}
                >
                  {/* Top row: server + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-background-100 flex items-center justify-center shrink-0">
                        <i className="ri-server-line text-[11px] text-foreground-500"></i>
                      </div>
                      <span className="text-xs font-medium text-foreground-900 truncate">{backup.serverName}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1 shrink-0 ${
                      isCompleted ? 'text-accent-600' : 'text-red-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-accent-500' : 'bg-red-500'}`}></span>
                      <span className="text-[10px] font-medium whitespace-nowrap">
                        {isCompleted ? 'OK' : 'Ошибка'}
                      </span>
                    </span>
                  </div>

                  {/* Type badge */}
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium w-fit whitespace-nowrap ${typeColor}`}>
                    <i className={`${typeIcon} text-[10px]`}></i>
                    {typeLabel}
                  </span>

                  {/* Bottom row: time + size */}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <span className="text-[10px] text-foreground-400 whitespace-nowrap">
                      {formatRelativeTime(backup.startedAt)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-foreground-500 whitespace-nowrap">
                      <span className="font-mono text-[10px]">{backup.duration}</span>
                      {isCompleted && (
                        <>
                          <span className="text-foreground-300">&middot;</span>
                          <span className="font-mono text-[10px]">{backup.size}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Error message for failed */}
                  {isFailed && backup.errorMessage && (
                    <div className="flex items-start gap-1 mt-0.5">
                      <i className="ri-error-warning-line text-[10px] text-red-500 shrink-0 mt-0.5"></i>
                      <span className="text-[10px] text-red-500 line-clamp-2 leading-tight">{backup.errorMessage}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== WIDGETS 2x2 row 2 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Recent emails widget */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <WidgetHeader
            icon="ri-mail-line"
            title="Последние письма"
            count={stats.emailsUnread}
            linkTo="/mail"
            linkLabel="Вся почта"
          />
          <div className="space-y-1">
            {recentEmails.map((email) => (
              <div
                key={email.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-background-100/40 ${
                  !email.isRead ? 'bg-background-100/50' : ''
                }`}
                onClick={() => window.REACT_APP_NAVIGATE?.(`/mail/${email.id}`)}
              >
                <div className="w-8 h-8 rounded-full bg-secondary-100 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-secondary-700">
                    {email.fromName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate ${email.isRead ? 'font-medium text-foreground-700' : 'font-semibold text-foreground-900'}`}>
                      {email.fromName}
                    </p>
                    <span className="text-[10px] text-foreground-400 shrink-0">{formatRelativeTime(email.receivedAt)}</span>
                  </div>
                  <p className="text-xs text-foreground-700 mt-0.5 line-clamp-1">{email.subject}</p>
                  {!email.isRead && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                      <span className="text-[10px] text-primary-600 font-medium">Новое</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Domain health widget */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <WidgetHeader
            icon="ri-global-line"
            title="Состояние доменов"
            count={stats.domainsTotal}
            linkTo="/domains"
            linkLabel="Все домены"
          />
          <div className="space-y-1">
            {domainsWithHealth.map((domain) => {
              const healthConfig = {
                good: { dot: 'bg-accent-500', label: 'Активен', cls: 'text-accent-700 bg-accent-100' },
                warning: { dot: 'bg-amber-500', label: domain.status === 'pending' ? 'Ожидание' : domain.status === 'transferred' ? 'Перенесён' : `${domain.daysLeft}д`, cls: 'text-amber-700 bg-amber-100' },
                critical: { dot: 'bg-red-500', label: domain.status === 'expired' ? 'Истёк' : 'Истёк', cls: 'text-red-700 bg-red-100' },
              }[domain.health];

              return (
                <div
                  key={domain.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-background-100/40 transition-colors cursor-pointer"
                  onClick={() => window.REACT_APP_NAVIGATE?.(`/domains/dns/${domain.id}`)}
                >
                  <div className="w-7 h-7 rounded-md bg-secondary-100 flex items-center justify-center shrink-0">
                    <i className="ri-global-line text-xs text-secondary-600"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground-900 truncate">{domain.name}</p>
                    <p className="text-[10px] text-foreground-400">{domain.provider} &middot; {domain.registrar}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${healthConfig.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${healthConfig.dot}`}></span>
                      {healthConfig.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== QUICK BOOKMARKS ===== */}
      <div className="rounded-xl border border-background-200 bg-background-50 p-5 mb-5">
        <WidgetHeader
          icon="ri-bookmark-line"
          title="Быстрые закладки"
          count={quickBookmarks.length}
          linkTo="/bookmarks"
          linkLabel="Все закладки"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickBookmarks.map((bookmark) => {
            const category = initialCategories.find((c) => c.id === bookmark.categoryId);
            return (
              <a
                key={bookmark.id}
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1.5 p-3 rounded-lg border border-background-200 hover:border-background-300 hover:bg-background-100/50 transition-colors cursor-pointer no-underline group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-primary-100 flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                    <i className="ri-link text-xs text-primary-600"></i>
                  </div>
                  <span className="text-xs font-medium text-foreground-900 truncate">{bookmark.name}</span>
                </div>
                {category && (
                  <span className="text-[10px] text-foreground-400">{category.name}</span>
                )}
              </a>
            );
          })}
        </div>
      </div>

      {/* ===== QUICK LINKS ===== */}
      <div className="rounded-xl border border-background-200 bg-background-50 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center">
            <i className="ri-apps-line text-sm text-secondary-600"></i>
          </div>
          <h3 className="font-heading text-sm font-semibold text-foreground-900">Быстрый доступ</h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { to: '/servers', icon: 'ri-server-line', label: 'Серверы', color: 'bg-accent-100 text-accent-700 hover:bg-accent-200' },
            { to: '/domains', icon: 'ri-global-line', label: 'Домены', color: 'bg-primary-100 text-primary-700 hover:bg-primary-200' },
            { to: '/monitoring', icon: 'ri-dashboard-line', label: 'Мониторинг', color: 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200' },
            { to: '/mail', icon: 'ri-mail-line', label: 'Почта', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
            { to: '/messages', icon: 'ri-message-2-line', label: 'Сообщения', color: 'bg-primary-100 text-primary-700 hover:bg-primary-200' },
            { to: '/alerts', icon: 'ri-alert-line', label: 'Оповещения', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
            { to: '/logs', icon: 'ri-file-list-3-line', label: 'Логи', color: 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200' },
            { to: '/settings', icon: 'ri-settings-4-line', label: 'Настройки', color: 'bg-background-100 text-foreground-700 hover:bg-background-200' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg transition-colors cursor-pointer ${link.color}`}
            >
              <i className={`${link.icon} text-base`}></i>
              <span className="text-[10px] font-medium whitespace-nowrap">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}