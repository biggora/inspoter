export type BackupType = "full" | "incremental" | "database";
export type BackupStatus = "completed" | "failed" | "in_progress";
export type ScheduleStatus = "active" | "paused";

export interface BackupSchedule {
  id: string;
  serverId: string;
  serverName: string;
  type: BackupType;
  frequency: string;
  retention: string;
  status: ScheduleStatus;
  nextRun: string;
  lastRun: string | null;
  lastSize: string | null;
}

export interface BackupEntry {
  id: string;
  scheduleId: string;
  serverId: string;
  serverName: string;
  type: BackupType;
  status: BackupStatus;
  startedAt: string;
  completedAt: string | null;
  duration: string;
  size: string;
  location: string;
  errorMessage?: string;
}

export const mockBackupSchedules: BackupSchedule[] = [
  {
    id: "sch-01",
    serverId: "srv-01",
    serverName: "web-prod-01",
    type: "full",
    frequency: "Ежедневно в 03:00 (UTC)",
    retention: "30 дней",
    status: "active",
    nextRun: "2026-07-13T03:00:00Z",
    lastRun: "2026-07-12T03:02:11Z",
    lastSize: "4.8 GB",
  },
  {
    id: "sch-02",
    serverId: "srv-02",
    serverName: "web-prod-02",
    type: "full",
    frequency: "Ежедневно в 03:30 (UTC)",
    retention: "30 дней",
    status: "active",
    nextRun: "2026-07-13T03:30:00Z",
    lastRun: "2026-07-12T03:31:45Z",
    lastSize: "4.2 GB",
  },
  {
    id: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    frequency: "Каждые 6 часов",
    retention: "14 дней",
    status: "active",
    nextRun: "2026-07-12T18:00:00Z",
    lastRun: "2026-07-12T12:00:22Z",
    lastSize: "12.1 GB",
  },
  {
    id: "sch-04",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "full",
    frequency: "Еженедельно, Вс 02:00 (UTC)",
    retention: "90 дней",
    status: "active",
    nextRun: "2026-07-19T02:00:00Z",
    lastRun: "2026-07-12T02:14:08Z",
    lastSize: "28.7 GB",
  },
  {
    id: "sch-05",
    serverId: "srv-04",
    serverName: "db-replica",
    type: "database",
    frequency: "Каждые 12 часов",
    retention: "14 дней",
    status: "paused",
    nextRun: "—",
    lastRun: "2026-07-10T00:00:18Z",
    lastSize: "11.8 GB",
  },
  {
    id: "sch-06",
    serverId: "srv-05",
    serverName: "cache-node",
    type: "incremental",
    frequency: "Каждые 4 часа",
    retention: "7 дней",
    status: "active",
    nextRun: "2026-07-12T16:00:00Z",
    lastRun: "2026-07-12T12:00:05Z",
    lastSize: "0.9 GB",
  },
  {
    id: "sch-07",
    serverId: "srv-06",
    serverName: "dev-staging",
    type: "full",
    frequency: "Еженедельно, Пн 06:00 (UTC)",
    retention: "14 дней",
    status: "paused",
    nextRun: "—",
    lastRun: "2026-07-06T06:05:33Z",
    lastSize: "6.3 GB",
  },
];

function genDate(offsetHours: number, extraMinutes: number = 0): string {
  const d = new Date();
  d.setHours(d.getHours() - offsetHours, d.getMinutes() + extraMinutes);
  return d.toISOString();
}

function formatDuration(start: Date, end: Date): string {
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diffMin < 1) return "< 1 мин";
  if (diffMin < 60) return `${diffMin} мин`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export const mockBackupHistory: BackupEntry[] = [
  // db-primary database backups (every 6h)
  {
    id: "bkp-001",
    scheduleId: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    status: "completed",
    startedAt: genDate(0, 0),
    completedAt: genDate(0, 8),
    duration: "8 мин",
    size: "12.1 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-002",
    scheduleId: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    status: "completed",
    startedAt: genDate(6, 0),
    completedAt: genDate(6, 9),
    duration: "9 мин",
    size: "12.0 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-003",
    scheduleId: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    status: "completed",
    startedAt: genDate(12, 0),
    completedAt: genDate(12, 7),
    duration: "7 мин",
    size: "11.9 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-004",
    scheduleId: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    status: "failed",
    startedAt: genDate(18, 0),
    completedAt: genDate(18, 15),
    duration: "15 мин",
    size: "—",
    location: "Hetzner Storage Box (FSN1)",
    errorMessage: "Connection timeout to storage backend after 900s",
  },
  {
    id: "bkp-005",
    scheduleId: "sch-03",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "database",
    status: "completed",
    startedAt: genDate(18, 20),
    completedAt: genDate(18, 28),
    duration: "8 мин",
    size: "12.1 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  // web-prod-01 full daily
  {
    id: "bkp-006",
    scheduleId: "sch-01",
    serverId: "srv-01",
    serverName: "web-prod-01",
    type: "full",
    status: "completed",
    startedAt: genDate(9, 0),
    completedAt: genDate(9, 22),
    duration: "22 мин",
    size: "4.8 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-007",
    scheduleId: "sch-01",
    serverId: "srv-01",
    serverName: "web-prod-01",
    type: "full",
    status: "completed",
    startedAt: genDate(33, 0),
    completedAt: genDate(33, 24),
    duration: "24 мин",
    size: "4.7 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-008",
    scheduleId: "sch-01",
    serverId: "srv-01",
    serverName: "web-prod-01",
    type: "full",
    status: "completed",
    startedAt: genDate(57, 0),
    completedAt: genDate(57, 23),
    duration: "23 мин",
    size: "4.6 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-009",
    scheduleId: "sch-01",
    serverId: "srv-01",
    serverName: "web-prod-01",
    type: "full",
    status: "completed",
    startedAt: genDate(81, 0),
    completedAt: genDate(81, 21),
    duration: "21 мин",
    size: "4.5 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  // web-prod-02 full daily
  {
    id: "bkp-010",
    scheduleId: "sch-02",
    serverId: "srv-02",
    serverName: "web-prod-02",
    type: "full",
    status: "completed",
    startedAt: genDate(9, 30),
    completedAt: genDate(9, 50),
    duration: "20 мин",
    size: "4.2 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-011",
    scheduleId: "sch-02",
    serverId: "srv-02",
    serverName: "web-prod-02",
    type: "full",
    status: "completed",
    startedAt: genDate(33, 30),
    completedAt: genDate(33, 52),
    duration: "22 мин",
    size: "4.1 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-012",
    scheduleId: "sch-02",
    serverId: "srv-02",
    serverName: "web-prod-02",
    type: "full",
    status: "failed",
    startedAt: genDate(57, 30),
    completedAt: genDate(57, 35),
    duration: "5 мин",
    size: "—",
    location: "Hetzner Storage Box (FSN1)",
    errorMessage: "Disk space exhausted on storage target (95% used)",
  },
  {
    id: "bkp-013",
    scheduleId: "sch-02",
    serverId: "srv-02",
    serverName: "web-prod-02",
    type: "full",
    status: "completed",
    startedAt: genDate(57, 50),
    completedAt: genDate(57, 72),
    duration: "22 мин",
    size: "4.2 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  // db-primary weekly full
  {
    id: "bkp-014",
    scheduleId: "sch-04",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "full",
    status: "completed",
    startedAt: genDate(9, 0),
    completedAt: genDate(9, 52),
    duration: "52 мин",
    size: "28.7 GB",
    location: "Hetzner Storage Box (HEL1)",
  },
  {
    id: "bkp-015",
    scheduleId: "sch-04",
    serverId: "srv-03",
    serverName: "db-primary",
    type: "full",
    status: "completed",
    startedAt: genDate(177, 0),
    completedAt: genDate(177, 55),
    duration: "55 мин",
    size: "27.9 GB",
    location: "Hetzner Storage Box (HEL1)",
  },
  // cache-node incremental
  {
    id: "bkp-016",
    scheduleId: "sch-06",
    serverId: "srv-05",
    serverName: "cache-node",
    type: "incremental",
    status: "completed",
    startedAt: genDate(0, 0),
    completedAt: genDate(0, 2),
    duration: "2 мин",
    size: "0.9 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-017",
    scheduleId: "sch-06",
    serverId: "srv-05",
    serverName: "cache-node",
    type: "incremental",
    status: "completed",
    startedAt: genDate(4, 0),
    completedAt: genDate(4, 1),
    duration: "1 мин",
    size: "0.8 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-018",
    scheduleId: "sch-06",
    serverId: "srv-05",
    serverName: "cache-node",
    type: "incremental",
    status: "completed",
    startedAt: genDate(8, 0),
    completedAt: genDate(8, 2),
    duration: "2 мин",
    size: "0.9 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  {
    id: "bkp-019",
    scheduleId: "sch-06",
    serverId: "srv-05",
    serverName: "cache-node",
    type: "incremental",
    status: "in_progress",
    startedAt: genDate(12, 0),
    completedAt: null,
    duration: "~2 мин",
    size: "—",
    location: "Hetzner Storage Box (FSN1)",
  },
  // db-replica (paused, last one before pause)
  {
    id: "bkp-020",
    scheduleId: "sch-05",
    serverId: "srv-04",
    serverName: "db-replica",
    type: "database",
    status: "completed",
    startedAt: genDate(48, 0),
    completedAt: genDate(48, 10),
    duration: "10 мин",
    size: "11.8 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
  // dev-staging (paused)
  {
    id: "bkp-021",
    scheduleId: "sch-07",
    serverId: "srv-06",
    serverName: "dev-staging",
    type: "full",
    status: "completed",
    startedAt: genDate(144, 0),
    completedAt: genDate(144, 18),
    duration: "18 мин",
    size: "6.3 GB",
    location: "Hetzner Storage Box (FSN1)",
  },
];

export const backupTypeLabels: Record<BackupType, string> = {
  full: "Полный",
  incremental: "Инкрементальный",
  database: "База данных",
};

export const backupTypeIcons: Record<BackupType, string> = {
  full: "ri-hard-drive-3-line",
  incremental: "ri-git-branch-line",
  database: "ri-database-2-line",
};

export const backupTypeColors: Record<BackupType, string> = {
  full: "text-accent-700 bg-accent-100",
  incremental: "text-secondary-700 bg-secondary-100",
  database: "text-primary-700 bg-primary-100",
};
