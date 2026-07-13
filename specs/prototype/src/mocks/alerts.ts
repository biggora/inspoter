export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertEntry {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  source: string;
  service: string;
  title: string;
  message: string;
  details: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export const alertSeverities: Record<
  AlertSeverity,
  { label: string; color: string; bg: string; dot: string; icon: string }
> = {
  critical: {
    label: "Критический",
    color: "text-red-700",
    bg: "bg-red-100",
    dot: "bg-red-500",
    icon: "ri-close-circle-fill",
  },
  warning: {
    label: "Предупреждение",
    color: "text-amber-700",
    bg: "bg-amber-100",
    dot: "bg-amber-500",
    icon: "ri-alert-fill",
  },
  info: {
    label: "Информация",
    color: "text-accent-700",
    bg: "bg-accent-100",
    dot: "bg-accent-500",
    icon: "ri-information-fill",
  },
};

export const mockAlerts: AlertEntry[] = [
  {
    id: "alert-001",
    timestamp: "2026-07-12T10:23:00.000Z",
    severity: "critical",
    source: "web-prod-01",
    service: "nginx",
    title: "Сервер web-prod-01 недоступен",
    message:
      "Сервер web-prod-01 (49.12.34.56) не отвечает на health-check запросы. Последний успешный ответ: 10:18. Таймаут соединения: 30 секунд.",
    details:
      "Target: 49.12.34.56 | Port: 443 | Endpoint: /health | Failures: 3/3 consecutive | Interval: 15s | Last successful: 2026-07-12T10:18:00Z | Load balancer: removing from pool | Affected services: inspot.app API, Dashboard",
    acknowledged: false,
  },
  {
    id: "alert-002",
    timestamp: "2026-07-12T10:15:30.000Z",
    severity: "critical",
    source: "db-primary",
    service: "postgresql",
    title: "База данных db-primary: превышен лимит подключений",
    message:
      "FATAL: too many connections (max 200). Новые подключения к базе inspot_prod отклоняются. Текущее количество: 200/200.",
    details:
      "Database: inspot_prod | Max connections: 200 | Current: 200 | Waiting: 34 queries | Top consumer: api-gateway (78 connections) | Action: connection pooling exhausted | Impact: all write operations failing",
    acknowledged: false,
  },
  {
    id: "alert-003",
    timestamp: "2026-07-12T10:12:00.000Z",
    severity: "critical",
    source: "cache-node",
    service: "redis",
    title: "Redis OOM Kill — cache-node перезапущен",
    message:
      "OOM Killer завершил redis-server (PID: 12845). Использование памяти: 6.2GB / 6.0GB. Сервис автоматически перезапущен, простой: 45 секунд.",
    details:
      "PID: 12845 | Memory: 6.2GB / 6.0GB | OOM Score: 937 | Kernel: Linux 5.15.0 | Restart: automatic | Downtime: 45s | Recovery: RDB snapshot | Lost writes: 12 min AOF | Actions taken: increased maxmemory to 8GB, adjusted eviction policy to allkeys-lru",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T10:17:00.000Z",
    acknowledgedBy: "admin",
  },
  {
    id: "alert-004",
    timestamp: "2026-07-12T10:08:00.000Z",
    severity: "critical",
    source: "cloudflare",
    service: "dns",
    title: "DNS-сбой: monitoring-tool.com не резолвится в APAC",
    message:
      "NS-записи для monitoring-tool.com не резолвятся в Азиатско-Тихоокеанском регионе (Сингапур, Токио). NXDOMAIN для всех запросов из APAC. Пропагация длится более 14 часов.",
    details:
      "Domain: monitoring-tool.com | Regions affected: Singapore, Tokyo, Sydney | Expected NS: ns1.cloudflare.com | Current: NXDOMAIN | Duration: 14h 23m | Impact: APAC users unable to access service | Root cause: TLD registry propagation delay",
    acknowledged: false,
  },
  {
    id: "alert-005",
    timestamp: "2026-07-12T10:05:00.000Z",
    severity: "warning",
    source: "web-prod-01",
    service: "nginx",
    title: "Высокое время ответа API: 99-й перцентиль > 2 секунды",
    message:
      "P99 latency для /api/v2/analytics вырос до 2.8s (норма: < 1.5s). Затронуто 12% запросов за последние 15 минут.",
    details:
      "Endpoint: /api/v2/analytics | P50: 340ms | P95: 1.2s | P99: 2.8s | Sample size: 4,231 req/15min | Affected: 12% | Upstream: backend:3000 | Possible cause: DB slow queries during autovacuum",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T10:18:00.000Z",
    acknowledgedBy: "marco",
  },
  {
    id: "alert-006",
    timestamp: "2026-07-12T09:58:00.000Z",
    severity: "warning",
    source: "db-replica",
    service: "postgresql",
    title: "Задержка репликации: 3.2GB отставания от primary",
    message:
      "WAL receiver на db-replica отстаёт от primary на 45 секунд (3.2GB). Скорость репликации: 72 MB/s, WAL generation: 78 MB/s.",
    details:
      "Primary: db-primary (78.46.12.34) | Lag bytes: 3.2GB | Lag seconds: 45 | WAL segment: 0000000100000045000000A2 | Replication slot: replica_slot_01 | Trend: increasing (+8 min ago: 2.1GB)",
    acknowledged: false,
  },
  {
    id: "alert-007",
    timestamp: "2026-07-12T09:50:00.000Z",
    severity: "warning",
    source: "cache-node",
    service: "redis",
    title: "Использование памяти Redis: 85% порога",
    message:
      "Used memory: 5.1GB / 6.0GB (85%). При текущем тренде порог будет достигнут через ~40 минут.",
    details:
      "Used: 5.1GB | Max: 6.0GB | Peak: 5.3GB | Evictions: 0 (allkeys-lru) | Fragmentation: 1.08 | Keys: 4.2M | Expiring: 1.3M | Trend: +120MB/10min",
    acknowledged: false,
  },
  {
    id: "alert-008",
    timestamp: "2026-07-12T09:45:00.000Z",
    severity: "warning",
    source: "web-prod-02",
    service: "node",
    title: "Использование памяти Node.js: 1.45GB / 1.5GB",
    message:
      "Heap usage на web-prod-02 достигла 96.7%. Частота GC выросла до каждых 8.3 секунд. Процесс близок к OOM.",
    details:
      "PID: 31205 | Heap: 1.45GB / 1.5GB | RSS: 1.82GB | External: 234MB | GC frequency: every 8.3s (was every 45s) | Memory pressure: 96.7% | Recommendation: scale to 2GB heap or add instance",
    acknowledged: false,
  },
  {
    id: "alert-009",
    timestamp: "2026-07-12T09:40:00.000Z",
    severity: "warning",
    source: "web-prod-01",
    service: "nginx",
    title: "Rate limit превышен: 120 req/min от IP 45.33.12.89",
    message:
      "IP 45.33.12.89 (US) превысил лимит 100 req/min. Возвращается 429 Too Many Requests. 23 запроса заблокированы за минуту.",
    details:
      "IP: 45.33.12.89 | Zone: api_rate_limit | Limit: 100/60s | Actual: 120/60s | Blocked: 23 | Country: US | UA: python-requests/2.32.0 | Pattern: sequential scanning — possible scraper",
    acknowledged: false,
  },
  {
    id: "alert-010",
    timestamp: "2026-07-12T09:35:00.000Z",
    severity: "warning",
    source: "db-replica",
    service: "postgresql",
    title: "Медленный запрос: 34.2s на analytics_events",
    message:
      "SELECT с неоптимизированным JOIN на таблице analytics_events выполняется 34.2s. Затронуто 1.2M строк.",
    details:
      "PID: 31982 | Duration: 34.2s | Query: SELECT e.*, u.name FROM analytics_events e LEFT JOIN users u ON e.user_id = u.id WHERE created_at > now() - interval '7 days' | Rows: 1.2M | Plan: Seq Scan | Suggestion: add index on created_at",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:50:00.000Z",
    acknowledgedBy: "admin",
  },
  {
    id: "alert-011",
    timestamp: "2026-07-12T09:30:00.000Z",
    severity: "info",
    source: "inspot-monitoring",
    service: "alertmanager",
    title: "Скачок CPU на web-prod-01 разрешён",
    message:
      "Загрузка CPU на web-prod-01 вернулась к 23% (была 97%). Причина: runaway image processing worker. Применено ограничение скорости фоновых задач.",
    details:
      "Server: web-prod-01 | CPU before: 97.3% | CPU after: 23.4% | Spike duration: 12 min | Root cause: image processing worker (PID: 29384) | Fix: rate-limited background job queue | Status: resolved",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:32:00.000Z",
    acknowledgedBy: "marco",
  },
  {
    id: "alert-012",
    timestamp: "2026-07-12T09:25:00.000Z",
    severity: "info",
    source: "db-primary",
    service: "postgresql",
    title: "Autovacuum завершён: удалено 2.4M мёртвых строк",
    message:
      "Autovacuum на таблице log_entries завершён за 18.3s. Удалено 2.4M dead rows, освобождено 284MB.",
    details:
      "Table: public.log_entries | Dead rows: 2.4M | Duration: 18.3s | Pages: 52,340 | Space freed: 284MB | Index scans: 12 | Next scheduled: based on threshold",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:26:00.000Z",
    acknowledgedBy: "admin",
  },
  {
    id: "alert-013",
    timestamp: "2026-07-12T09:20:00.000Z",
    severity: "info",
    source: "letsencrypt",
    service: "certbot",
    title: "SSL-сертификат для inspot.app продлён",
    message:
      "Сертификат для inspot.app успешно продлён. Действителен до 10 октября 2026.",
    details:
      "Domain: inspot.app | SAN: inspot.app, www.inspot.app | Challenge: HTTP-01 | Validation: 2.3s | Certificate: /etc/letsencrypt/live/inspot.app/fullchain.pem | Expiry: 2026-10-10",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:20:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-014",
    timestamp: "2026-07-12T09:15:00.000Z",
    severity: "info",
    source: "hetzner",
    service: "cloud",
    title: "Снапшот db-primary создан",
    message:
      "Автоматический daily-снапшот db-primary создан. ID: snap-2026-07-12-0915. Размер: 120GB, длительность: 4.2s.",
    details:
      "Server: db-primary | Snapshot: snap-2026-07-12-0915 | Size: 120GB | Duration: 4.2s | Type: daily | Retention: 7 days | Status: available",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:15:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-015",
    timestamp: "2026-07-12T09:10:00.000Z",
    severity: "critical",
    source: "api-gateway",
    service: "envoy",
    title: "API Gateway: потеря соединения с db-primary",
    message:
      "Envoy не может подключиться к db-primary:5432. Connection refused после 3 попыток. Circuit breaker в состоянии CLOSED.",
    details:
      "Upstream: db-primary:5432 | Retries: 3/3 | Timeout: 5s | Error: ECONNREFUSED | Circuit breaker: CLOSED | Failures: 1/5 | Cluster: postgresql_primary | Impact: all DB-dependent APIs failing",
    acknowledged: false,
  },
  {
    id: "alert-016",
    timestamp: "2026-07-12T09:05:00.000Z",
    severity: "warning",
    source: "cloudflare",
    service: "ssl",
    title: "SSL-сертификат cdn-delivery.net истекает через 7 дней",
    message:
      "Edge-сертификат для cdn-delivery.net истекает 18 июля 2026. Автопродление запланировано, но пока не выполнено.",
    details:
      "Domain: cdn-delivery.net | Certificate ID: cert_394857 | Issuer: Let's Encrypt R3 | Expires: 2026-07-18 | Auto-renew: pending | SAN: cdn-delivery.net, *.cdn-delivery.net",
    acknowledged: false,
  },
  {
    id: "alert-017",
    timestamp: "2026-07-12T09:00:00.000Z",
    severity: "info",
    source: "dockerhub",
    service: "registry",
    title: "Сканирование образа inspot/api:latest завершено",
    message:
      "0 critical, 0 high, 2 medium уязвимостей найдено. CVE-2026-28391, CVE-2026-28400.",
    details:
      "Image: inspot/api:latest (SHA256: def89ab...) | Critical: 0 | High: 0 | Medium: 2 | Low: 4 | CVEs: CVE-2026-28391 (libssl 7.5), CVE-2026-28400 (libcrypto 7.5)",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T09:01:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-018",
    timestamp: "2026-07-12T03:13:00.000Z",
    severity: "critical",
    source: "inspot-monitoring",
    service: "alertmanager",
    title: "Alert Firing: cache-node недоступен",
    message:
      "Три последовательных отказа health-check для cache-node (TCP 6379). Сервер не отвечает. Отправлены уведомления в Slack и Email.",
    details:
      "Target: cache-node (116.203.45.67) | Check: TCP port 6379 | Failures: 3/3 | Interval: 10s | Notified: Slack #devops, Email alerts@inspot.app | Previous state: OK → CRITICAL",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T03:15:00.000Z",
    acknowledgedBy: "oncall-engineer",
  },
  {
    id: "alert-019",
    timestamp: "2026-07-12T01:30:00.000Z",
    severity: "warning",
    source: "db-primary",
    service: "postgresql",
    title: "Чекпоинт: 842 WAL-сегмента переработано",
    message:
      "Контрольная точка завершена: 842 WAL-сегментов переработано, записано 12.4GB данных. Длительность: 28.4s.",
    details:
      "WAL segments: 842 recycled | Data written: 12.4GB | Duration: 28.4s | Distance: 12.4GB | Buffers: 128MB | Impact: slight I/O pressure during checkpoint",
    acknowledged: true,
    acknowledgedAt: "2026-07-12T01:31:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-020",
    timestamp: "2026-07-11T23:45:00.000Z",
    severity: "info",
    source: "db-primary",
    service: "postgresql",
    title: "Ночное обслуживание БД завершено",
    message:
      "ANALYZE + REINDEX на 12 таблицах выполнены успешно. Общая длительность: 34.2s. Ошибок: 0.",
    details:
      "Tables: 12 analyzed | Indexes: 34 rebuilt | Duration: 34.2s | Locks: AccessShareLock, AccessExclusiveLock (concurrent) | Errors: 0 | Next: 2026-07-12 23:45",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T23:46:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-021",
    timestamp: "2026-07-11T22:30:00.000Z",
    severity: "warning",
    source: "web-prod-01",
    service: "node",
    title: "Event loop lag: 450ms (порог: 100ms)",
    message:
      "Обнаружена задержка event loop из-за major GC (Mark-Compact). Пиковая задержка: 450ms. Возможны таймауты запросов.",
    details:
      "PID: 28491 | Heap: 1.2GB / 1.5GB | GC: Mark-Compact | Duration: 342ms | Event loop lag: 450ms | Node: v22.11.0 | Impact: request timeouts possible during GC pause",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T22:35:00.000Z",
    acknowledgedBy: "marco",
  },
  {
    id: "alert-022",
    timestamp: "2026-07-11T20:15:00.000Z",
    severity: "info",
    source: "github",
    service: "actions",
    title: 'Workflow "Run Integration Tests": 342 passed, 0 failed',
    message:
      "Интеграционные тесты для feature/dashboard-v2 пройдены успешно. Покрытие: 87.3%. Длительность: 2m 14s.",
    details:
      "Repo: inspot/dashboard | Branch: feature/dashboard-v2 | Suite: integration | Passed: 342 | Failed: 0 | Duration: 134s | Coverage: 87.3%",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T20:15:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-023",
    timestamp: "2026-07-11T18:45:00.000Z",
    severity: "warning",
    source: "api-gateway",
    service: "envoy",
    title: "TLS handshake failed: unrecognized SNI",
    message:
      "Клиент 203.0.113.45 попытался подключиться с SNI spam-bot.net. TLS-рукопожатие отклонено.",
    details:
      "Client: 203.0.113.45 | SNI: spam-bot.net | Error: TLSV1_ALERT_UNRECOGNIZED_NAME | Cipher: none (failed at ClientHello) | Envoy: 1.30.2 | Action: no impact, connection rejected",
    acknowledged: false,
  },
  {
    id: "alert-024",
    timestamp: "2026-07-11T16:20:00.000Z",
    severity: "info",
    source: "web-prod-01",
    service: "audit",
    title: "Сервер web-prod-01 перезагружен пользователем admin",
    message:
      "Пользователь admin инициировал перезагрузку web-prod-01. Сервер успешно перезагружен за 23.4s.",
    details:
      "User: admin (ID: usr_01) | Action: restart | Target: web-prod-01 | Transition: running → restarting → running | Duration: 23.4s | Result: success",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T16:21:00.000Z",
    acknowledgedBy: "admin",
  },
  {
    id: "alert-025",
    timestamp: "2026-07-11T14:55:00.000Z",
    severity: "warning",
    source: "cloudflare",
    service: "waf",
    title: "WAF: заблокирована SQL-инъекция",
    message:
      "Правило 942100 (libinjection SQLi) сработало для IP 91.234.56.78. Запрос к /api/v1/search заблокирован.",
    details:
      "Zone: inspot.app | Rule: 942100 (SQLi) | IP: 91.234.56.78 | URI: /api/v1/search?q=SELECT * FROM users | Action: BLOCK | Country: RU | Method: GET",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T14:56:00.000Z",
    acknowledgedBy: "admin",
  },
  {
    id: "alert-026",
    timestamp: "2026-07-11T12:30:00.000Z",
    severity: "info",
    source: "dockerhub",
    service: "registry",
    title: "Новый образ: inspot/dashboard:v2.7.0 опубликован",
    message:
      "Образ inspot/dashboard:v2.7.0 загружен в реестр. Размер: 342MB (сжатый), 12 слоёв.",
    details:
      "Repository: inspot/dashboard | Tag: v2.7.0 | Digest: sha256:def89ab0123... | Size: 342MB compressed | Layers: 12 | Pushed by: CI pipeline",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T12:30:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-027",
    timestamp: "2026-07-11T10:00:00.000Z",
    severity: "critical",
    source: "web-prod-02",
    service: "node",
    title: "Unhandled Promise Rejection в контроллере серверов",
    message:
      'TypeError: Cannot read properties of undefined (reading "status") в ServerController.getStatus. Запрос завершился с ошибкой 500.',
    details:
      "File: /app/dist/controllers/serverController.js:142:35 | Error: TypeError at ServerController.getStatus | Stack: at async /app/dist/routes/serverRoutes.js:28:18 | PID: 31205 | Request ID: req_a3f8c21d",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T10:05:00.000Z",
    acknowledgedBy: "marco",
  },
  {
    id: "alert-028",
    timestamp: "2026-07-11T08:45:00.000Z",
    severity: "info",
    source: "hetzner",
    service: "billing",
    title: "Счёт #INV-2026-07 за июль 2026",
    message:
      "Сформирован счёт за июль: €247.53 (6 серверов). Автооплата 7 августа.",
    details:
      "Invoice: INV-2026-07 | Period: 2026-07 | Servers: 6 | Subtotal: €233.52 | VAT 19%: €44.37 | Total: €247.53 | Due: 2026-08-07 | Payment: auto",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T08:45:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-029",
    timestamp: "2026-07-11T07:00:00.000Z",
    severity: "info",
    source: "db-replica",
    service: "postgresql",
    title: "Резервное копирование завершено: 120GB → S3",
    message:
      "Base backup через wal-g завершён. 120GB выгружено в S3 Deep Archive за 45m 12s.",
    details:
      "Method: wal-g (S3) | Size: 120GB raw (48GB compressed) | Duration: 2712s | WAL range: ...A0 to ...A2 | Target: s3://inspot-backups/postgres/base/",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T07:01:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-030",
    timestamp: "2026-07-11T06:30:00.000Z",
    severity: "warning",
    source: "web-prod-01",
    service: "nginx",
    title: "Медленный запрос: /api/v2/domains/export — 8.3s",
    message:
      "Запрос POST /api/v2/domains/export выполнился за 8.3s (порог: 5s). Размер ответа: 14.2MB.",
    details:
      "Method: POST | URI: /api/v2/domains/export | Duration: 8.342s | Response: 14.2MB | Upstream: backend:3000 | UA: Mozilla/5.0 | Referer: inspot.app/domains",
    acknowledged: false,
  },
  {
    id: "alert-031",
    timestamp: "2026-07-11T05:00:00.000Z",
    severity: "info",
    source: "cronitor",
    service: "cron",
    title: 'Задача "nightly-backup" завершена',
    message:
      "Резервное копирование завершено: 48GB → S3 за 12m 34s. Контрольная сумма проверена.",
    details:
      "Job: nightly-backup | Target: s3://inspot-backups/postgres/2026-07-11/ | Size: 48.2GB | Duration: 754s | Checksum: sha256:3f8a2c... | Exit: 0",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T05:01:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-032",
    timestamp: "2026-07-11T03:00:00.000Z",
    severity: "critical",
    source: "inspot-monitoring",
    service: "alertmanager",
    title: "Ночной инцидент: каскадный сбой cache-node → db-primary",
    message:
      "OOM Kill redis вызвал каскадную нагрузку на db-primary. 45s downtime кэша, 12 минут потерянных данных. Все системы восстановлены.",
    details:
      "Root cause: redis OOM → 45s downtime | Cascade: cache miss flood → DB connection spike (200/200) → API timeouts | Recovery: redis restarted, DB connections released, circuit breakers reset | Total impact: 3m 12s degraded service | Postmortem: scheduled",
    acknowledged: true,
    acknowledgedAt: "2026-07-11T03:30:00.000Z",
    acknowledgedBy: "oncall-engineer",
  },
  {
    id: "alert-033",
    timestamp: "2026-07-10T23:00:00.000Z",
    severity: "info",
    source: "cronitor",
    service: "cron",
    title: "Ротация логов завершена: 84GB → S3 Deep Archive",
    message:
      "Задача log-rotation архивировала 312 файлов логов общим объёмом 84GB в S3 Deep Archive.",
    details:
      "Source: /var/log/*.log | Target: s3://inspot-logs/archive/2026/07/ | Volume: 84GB | Files: 312 | Class: DEEP_ARCHIVE | Duration: 12m 8s",
    acknowledged: true,
    acknowledgedAt: "2026-07-10T23:01:00.000Z",
    acknowledgedBy: "system",
  },
  {
    id: "alert-034",
    timestamp: "2026-07-10T18:00:00.000Z",
    severity: "warning",
    source: "hetzner",
    service: "cloud",
    title: "Превышение трафика: web-prod-01 — 92% месячного лимита",
    message:
      "Сервер web-prod-01 использовал 18.4TB из 20TB месячного лимита трафика. До конца месяца: 11 дней.",
    details:
      "Server: web-prod-01 | Traffic: 18.4TB / 20TB (92%) | Days remaining: 11 | Avg daily: 1.1TB | Projected total: 30.5TB | Overage: €1.19/TB | Estimated extra: €12.50",
    acknowledged: false,
  },
  {
    id: "alert-035",
    timestamp: "2026-07-10T12:00:00.000Z",
    severity: "info",
    source: "cloudflare",
    service: "analytics",
    title: "Недельный отчёт: 14.8M запросов, 99.97% кэшировано",
    message:
      "Еженедельный отчёт по трафику: 14.8M запросов, сэкономлено 842GB трафика, заблокировано 24.5K угроз.",
    details:
      "Period: 2026-07-03 to 2026-07-10 | Total: 14.8M | Cached: 99.97% | Bandwidth saved: 842GB (87%) | Threats: 24.5K blocked | Top country: DE (38%)",
    acknowledged: true,
    acknowledgedAt: "2026-07-10T12:01:00.000Z",
    acknowledgedBy: "system",
  },
];
