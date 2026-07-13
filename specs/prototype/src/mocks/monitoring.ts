export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface NetworkPoint {
  timestamp: string;
  incoming: number;
  outgoing: number;
}

export interface RequestPoint {
  timestamp: string;
  total: number;
  success: number;
  error: number;
}

export interface ServerMetric {
  id: string;
  name: string;
  host: string;
  status: "online" | "degraded" | "offline";
  cpu: number;
  memory: number;
  disk: number;
  networkIn: number;
  networkOut: number;
  uptime: string;
  region: string;
  cpuHistory: MetricPoint[];
  memoryHistory: MetricPoint[];
  diskHistory: MetricPoint[];
  networkHistory: NetworkPoint[];
}

export interface MonitoringSnapshot {
  servers: ServerMetric[];
  requestHistory: RequestPoint[];
  generatedAt: string;
}

export const timeRanges = [
  { key: "1h", label: "1 час", hours: 1 },
  { key: "6h", label: "6 часов", hours: 6 },
  { key: "24h", label: "24 часа", hours: 24 },
  { key: "7d", label: "7 дней", hours: 168 },
] as const;

function generateCpuHistory(
  base: number,
  variance: number,
  hours: number,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  const now = new Date();
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    const val = Math.max(
      1,
      Math.min(100, base + (Math.random() - 0.5) * variance * 2),
    );
    points.push({
      timestamp: t.toISOString(),
      value: Math.round(val * 10) / 10,
    });
  }
  return points;
}

function generateMemoryHistory(
  base: number,
  variance: number,
  hours: number,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  const now = new Date();
  let trend = base;
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    trend += (Math.random() - 0.48) * 1.2;
    trend = Math.max(20, Math.min(98, trend));
    points.push({
      timestamp: t.toISOString(),
      value: Math.round(trend * 10) / 10,
    });
  }
  return points;
}

function generateDiskHistory(base: number, hours: number): MetricPoint[] {
  const points: MetricPoint[] = [];
  const now = new Date();
  let used = base;
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    used += Math.random() * 0.15;
    used = Math.min(95, used);
    points.push({
      timestamp: t.toISOString(),
      value: Math.round(used * 10) / 10,
    });
  }
  return points;
}

function generateNetworkHistory(hours: number): NetworkPoint[] {
  const points: NetworkPoint[] = [];
  const now = new Date();
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    const incoming = Math.round((15 + Math.random() * 45) * 10) / 10;
    const outgoing = Math.round((8 + Math.random() * 30) * 10) / 10;
    points.push({ timestamp: t.toISOString(), incoming, outgoing });
  }
  return points;
}

function generateRequestHistory(hours: number): RequestPoint[] {
  const points: RequestPoint[] = [];
  const now = new Date();
  for (let i = hours; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    const hourOfDay = t.getHours();
    const baseTotal = hourOfDay >= 8 && hourOfDay <= 22 ? 2500 : 800;
    const total = Math.round(baseTotal + (Math.random() - 0.5) * 1400);
    const errorRate = 0.005 + Math.random() * 0.02;
    const error = Math.round(total * errorRate);
    const success = total - error;
    points.push({ timestamp: t.toISOString(), total, success, error });
  }
  return points;
}

const totalHours = 168;

export const mockMonitoring: MonitoringSnapshot = {
  generatedAt: new Date().toISOString(),
  servers: [
    {
      id: "web-prod-01",
      name: "web-prod-01",
      host: "78.46.12.34",
      status: "online",
      cpu: 34.2,
      memory: 61.8,
      disk: 47.3,
      networkIn: 28.4,
      networkOut: 12.7,
      uptime: "32д 14ч",
      region: "Nuremberg (FSN1)",
      cpuHistory: generateCpuHistory(32, 18, totalHours),
      memoryHistory: generateMemoryHistory(60, 8, totalHours),
      diskHistory: generateDiskHistory(47, totalHours),
      networkHistory: generateNetworkHistory(totalHours),
    },
    {
      id: "web-prod-02",
      name: "web-prod-02",
      host: "78.46.12.35",
      status: "online",
      cpu: 28.7,
      memory: 54.2,
      disk: 42.1,
      networkIn: 22.1,
      networkOut: 10.3,
      uptime: "32д 14ч",
      region: "Nuremberg (FSN1)",
      cpuHistory: generateCpuHistory(30, 16, totalHours),
      memoryHistory: generateMemoryHistory(53, 7, totalHours),
      diskHistory: generateDiskHistory(42, totalHours),
      networkHistory: generateNetworkHistory(totalHours),
    },
    {
      id: "db-primary",
      name: "db-primary",
      host: "78.46.12.40",
      status: "degraded",
      cpu: 68.5,
      memory: 82.3,
      disk: 71.8,
      networkIn: 5.2,
      networkOut: 3.8,
      uptime: "14д 6ч",
      region: "Nuremberg (FSN1)",
      cpuHistory: generateCpuHistory(55, 25, totalHours),
      memoryHistory: generateMemoryHistory(70, 10, totalHours),
      diskHistory: generateDiskHistory(71, totalHours),
      networkHistory: generateNetworkHistory(totalHours),
    },
    {
      id: "cache-node",
      name: "cache-node",
      host: "78.46.12.41",
      status: "online",
      cpu: 12.4,
      memory: 38.9,
      disk: 18.2,
      networkIn: 42.8,
      networkOut: 35.6,
      uptime: "60д 2ч",
      region: "Nuremberg (FSN1)",
      cpuHistory: generateCpuHistory(10, 10, totalHours),
      memoryHistory: generateMemoryHistory(35, 5, totalHours),
      diskHistory: generateDiskHistory(18, totalHours),
      networkHistory: generateNetworkHistory(totalHours),
    },
  ],
  requestHistory: generateRequestHistory(totalHours),
};
