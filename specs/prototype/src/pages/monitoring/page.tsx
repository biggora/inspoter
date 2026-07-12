import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { mockMonitoring, timeRanges } from '@/mocks/monitoring';
import type { MonitoringSnapshot, MetricPoint, NetworkPoint, RequestPoint, ServerMetric } from '@/mocks/monitoring';

type PageState = 'loading' | 'error' | 'ready';
type TimeRangeKey = '1h' | '6h' | '24h' | '7d';

function formatTime(iso: string, range: TimeRangeKey): string {
  const d = new Date(iso);
  if (range === '1h' || range === '6h') {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '24h') {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function sliceData<T>(data: T[], hours: number): T[] {
  if (data.length <= hours + 1) return data;
  return data.slice(data.length - hours - 1);
}

export default function MonitoringPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<MonitoringSnapshot | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('24h');

  const loadData = useCallback(() => {
    setPageState('loading');
    setTimeout(() => {
      setData(JSON.parse(JSON.stringify(mockMonitoring)) as MonitoringSnapshot);
      setPageState('ready');
    }, 700);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rangeHours = timeRanges.find((r) => r.key === timeRange)!.hours;

  const filteredServers = useMemo(() => {
    if (!data) return [];
    return data.servers.map((s) => ({
      ...s,
      cpuHistory: sliceData(s.cpuHistory, rangeHours),
      memoryHistory: sliceData(s.memoryHistory, rangeHours),
      diskHistory: sliceData(s.diskHistory, rangeHours),
      networkHistory: sliceData(s.networkHistory, rangeHours),
    }));
  }, [data, rangeHours]);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    return sliceData(data.requestHistory, rangeHours);
  }, [data, rangeHours]);

  const stats = useMemo(() => {
    if (!data) return { online: 0, degraded: 0, offline: 0, avgCpu: 0, avgMemory: 0, avgDisk: 0, totalNetIn: 0, totalNetOut: 0 };
    const servers = data.servers;
    return {
      online: servers.filter((s) => s.status === 'online').length,
      degraded: servers.filter((s) => s.status === 'degraded').length,
      offline: servers.filter((s) => s.status === 'offline').length,
      avgCpu: Math.round(servers.reduce((sum, s) => sum + s.cpu, 0) / servers.length * 10) / 10,
      avgMemory: Math.round(servers.reduce((sum, s) => sum + s.memory, 0) / servers.length * 10) / 10,
      avgDisk: Math.round(servers.reduce((sum, s) => sum + s.disk, 0) / servers.length * 10) / 10,
      totalNetIn: Math.round(servers.reduce((sum, s) => sum + s.networkIn, 0) * 10) / 10,
      totalNetOut: Math.round(servers.reduce((sum, s) => sum + s.networkOut, 0) * 10) / 10,
    };
  }, [data]);

  // Merged CPU data for area chart (all servers on one chart)
  const mergedCpuData = useMemo(() => {
    if (!filteredServers.length) return [];
    const first = filteredServers[0];
    return first.cpuHistory.map((pt, i) => {
      const point: Record<string, string | number> = { timestamp: pt.timestamp };
      filteredServers.forEach((s) => {
        point[s.name] = s.cpuHistory[i]?.value ?? 0;
      });
      return point;
    });
  }, [filteredServers]);

  // Merged memory data
  const mergedMemoryData = useMemo(() => {
    if (!filteredServers.length) return [];
    const first = filteredServers[0];
    return first.memoryHistory.map((pt, i) => {
      const point: Record<string, string | number> = { timestamp: pt.timestamp };
      filteredServers.forEach((s) => {
        point[s.name] = s.memoryHistory[i]?.value ?? 0;
      });
      return point;
    });
  }, [filteredServers]);

  // Pie data
  const pieData = useMemo(() => [
    { name: 'Онлайн', value: stats.online, color: 'oklch(0.50 0.14 175)' },
    { name: 'Деградация', value: stats.degraded, color: 'oklch(0.62 0.16 70)' },
    { name: 'Офлайн', value: stats.offline, color: 'oklch(0.55 0.19 30)' },
  ], [stats]);

  const chartColors = ['oklch(0.58 0.19 30)', 'oklch(0.50 0.14 175)', 'oklch(0.52 0.04 85)', 'oklch(0.42 0.14 30)'];

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload || !label) return null;
    return (
      <div className="rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-xs">
        <p className="font-medium text-foreground-700 mb-1">{formatTime(label, timeRange)}</p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }}></span>
            <span className="text-foreground-500">{entry.name}:</span>
            <span className="font-medium text-foreground-800">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const ChartContainer = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-background-200 bg-background-50 p-5">
      <div className="mb-4">
        <h4 className="font-heading text-sm font-semibold text-foreground-900">{title}</h4>
        {subtitle && <p className="text-[11px] text-foreground-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );

  if (pageState === 'loading') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="animate-skeleton h-8 w-48 rounded-lg"></div>
          <div className="animate-skeleton h-9 w-64 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-28 rounded-xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-72 rounded-xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="animate-skeleton h-72 rounded-xl"></div>
          <div className="animate-skeleton h-72 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-dashboard-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Не удалось загрузить метрики</h3>
          <p className="text-sm text-foreground-500 mb-6">Проверьте подключение к системе мониторинга и попробуйте снова.</p>
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
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-foreground-400">
            Обновлено: {new Date(data!.generatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50 self-start">
          {timeRanges.map((r) => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                timeRange === r.key
                  ? 'bg-primary-500 text-background-50'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={loadData}
            className="ml-1 w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer"
            title="Обновить"
          >
            <i className="ri-refresh-line text-sm"></i>
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-server-line text-sm text-accent-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Серверы</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">
            {stats.online}<span className="text-base text-foreground-400 font-normal">/{data!.servers.length}</span>
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[11px] text-accent-600"><span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>Online {stats.online}</span>
            {stats.degraded > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Deg {stats.degraded}</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
              <i className="ri-cpu-line text-sm text-primary-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">CPU (сред.)</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.avgCpu}<span className="text-base text-foreground-400 font-normal">%</span></p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-background-200 overflow-hidden">
            <div className="h-full rounded-full bg-primary-500 transition-all duration-500" style={{ width: `${Math.min(stats.avgCpu, 100)}%` }}></div>
          </div>
        </div>

        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center">
              <i className="ri-database-2-line text-sm text-secondary-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Память (сред.)</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.avgMemory}<span className="text-base text-foreground-400 font-normal">%</span></p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-background-200 overflow-hidden">
            <div className="h-full rounded-full bg-accent-500 transition-all duration-500" style={{ width: `${Math.min(stats.avgMemory, 100)}%` }}></div>
          </div>
        </div>

        <div className="rounded-xl border border-background-200 bg-background-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
              <i className="ri-wifi-line text-sm text-accent-600"></i>
            </div>
            <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">Сеть (сумм.)</span>
          </div>
          <p className="text-2xl font-heading font-bold text-foreground-950">{stats.totalNetIn}<span className="text-base text-foreground-400 font-normal"> MB/s</span></p>
          <p className="text-[11px] text-foreground-400 mt-1">↓ {stats.totalNetIn} MB/s &middot; ↑ {stats.totalNetOut} MB/s</p>
        </div>
      </div>

      {/* 2x2 Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* CPU Chart */}
        <ChartContainer title="CPU Usage" subtitle="По серверам, %">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={mergedCpuData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                {filteredServers.map((s, i) => (
                  <linearGradient key={s.id} id={`cpuGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors[i]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={chartColors[i]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(v: string) => formatTime(v, timeRange)} tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dx={-4} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              {filteredServers.map((s, i) => (
                <Area key={s.id} type="monotone" dataKey={s.name} stroke={chartColors[i]} fill={`url(#cpuGrad-${i})`} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Memory Chart */}
        <ChartContainer title="Memory Usage" subtitle="По серверам, %">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={mergedMemoryData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                {filteredServers.map((s, i) => (
                  <linearGradient key={s.id} id={`memGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors[i]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={chartColors[i]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(v: string) => formatTime(v, timeRange)} tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dx={-4} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              {filteredServers.map((s, i) => (
                <Area key={s.id} type="monotone" dataKey={s.name} stroke={chartColors[i]} fill={`url(#memGrad-${i})`} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Network Chart */}
        <ChartContainer title="Network Traffic" subtitle="Входящий / Исходящий, MB/s">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
              <XAxis dataKey="timestamp" data={filteredServers[0]?.networkHistory || []} tickFormatter={(v: string) => formatTime(v, timeRange)} tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dx={-4} unit=" MB" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line type="monotone" dataKey="incoming" name="Входящий" stroke={chartColors[0]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} data={filteredServers[0]?.networkHistory || []} />
              <Line type="monotone" dataKey="outgoing" name="Исходящий" stroke={chartColors[1]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} data={filteredServers[0]?.networkHistory || []} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Disk Chart */}
        <ChartContainer title="Disk Usage" subtitle="Использование диска, %">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(v: string) => formatTime(v, timeRange)} tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dx={-4} unit="%" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {filteredServers.map((s, i) => (
                <Line key={s.id} type="monotone" data={s.diskHistory} dataKey="value" name={s.name} stroke={chartColors[i]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Bottom row: Requests + Server Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Request throughput */}
        <div className="lg:col-span-2 rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="mb-4">
            <h4 className="font-heading text-sm font-semibold text-foreground-900">HTTP Requests</h4>
            <p className="text-[11px] text-foreground-400 mt-0.5">Успешные и с ошибками, запросов/час</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={filteredRequests} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--background-200))" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(v: string) => formatTime(v, timeRange)} tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-400))' }} axisLine={false} tickLine={false} dx={-4} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="success" name="Успешные" fill={chartColors[1]} stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="error" name="Ошибки" fill={chartColors[0]} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Server status pie */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="mb-4">
            <h4 className="font-heading text-sm font-semibold text-foreground-900">Статус серверов</h4>
            <p className="text-[11px] text-foreground-400 mt-0.5">Распределение по статусам</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData.filter((d) => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                {pieData.filter((d) => d.value > 0).map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0];
                return (
                  <div className="rounded-lg border border-background-200 bg-background-50 px-3 py-1.5 text-xs">
                    <span style={{ color: entry.payload.color }}>{entry.name}: {entry.value}</span>
                  </div>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2">
            {pieData.filter((d) => d.value > 0).map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }}></span>
                <span className="text-[11px] text-foreground-500">{entry.name}</span>
                <span className="text-[11px] font-medium text-foreground-700">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Server table */}
      <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-100">
          <h4 className="font-heading text-sm font-semibold text-foreground-900">Инфраструктура</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Сервер</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Статус</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">CPU</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">RAM</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Disk</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Сеть ↓</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Сеть ↑</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-foreground-400 uppercase tracking-wide">Аптайм</th>
              </tr>
            </thead>
            <tbody>
              {data!.servers.map((server) => {
                const statusInfo = {
                  online: { dot: 'bg-accent-500', label: 'Онлайн', cls: 'text-accent-700 bg-accent-100' },
                  degraded: { dot: 'bg-amber-500', label: 'Деградация', cls: 'text-amber-700 bg-amber-100' },
                  offline: { dot: 'bg-red-500', label: 'Офлайн', cls: 'text-red-700 bg-red-100' },
                }[server.status];

                return (
                  <tr key={server.id} className="border-b border-background-100 hover:bg-background-100/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-foreground-900">{server.name}</p>
                      <p className="text-[11px] text-foreground-400">{server.host} &middot; {server.region}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusInfo.cls} whitespace-nowrap`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot} ${server.status === 'degraded' ? 'animate-pulse' : ''}`}></span>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-medium ${server.cpu > 80 ? 'text-red-600' : server.cpu > 60 ? 'text-amber-600' : 'text-foreground-800'}`}>{server.cpu}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-medium ${server.memory > 85 ? 'text-red-600' : server.memory > 70 ? 'text-amber-600' : 'text-foreground-800'}`}>{server.memory}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-medium ${server.disk > 85 ? 'text-red-600' : server.disk > 70 ? 'text-amber-600' : 'text-foreground-800'}`}>{server.disk}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-foreground-700">{server.networkIn} MB/s</td>
                    <td className="px-5 py-3.5 text-right font-medium text-foreground-700">{server.networkOut} MB/s</td>
                    <td className="px-5 py-3.5 text-right text-foreground-500">{server.uptime}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}