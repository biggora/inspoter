import { randomUUID, createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

// Optional demo-data seed (R4.4). Populates representative content across
// every dashboard section so a fresh install isn't empty. Separate from the
// mandatory bootstrap seed (`prisma/seed.ts` — operator + workspace) and
// assumes that seed has already run. Invoked via `npm run db:seed:demo`
// (-> `node prisma/seed-demo.ts`).
//
// Uses the `pg` driver directly rather than the generated Prisma client —
// same reasoning as prisma/seed.ts's header comment (no bundler-aware module
// resolution available under a bare `node` invocation).
//
// Idempotency: every demo row is tagged via the `DEMO_MARKER` prefix on the
// top-level container name for that section (Category/AlertCategory/
// MessageCategory name, or WebhookToken name). Before inserting, each
// section checks whether its marker-prefixed container already exists for
// the target workspace and skips if so — safe to run multiple times.

const DEMO_MARKER = "[Demo] ";

interface ClientLike {
  query: Client["query"];
}

async function findWorkspace(client: ClientLike): Promise<string> {
  const result = await client.query('SELECT id FROM "Workspace" LIMIT 1');
  if (!result.rowCount || result.rowCount === 0) {
    throw new Error(
      "Demo seed aborted: no Workspace found. Run `npm run db:seed` first.",
    );
  }
  return result.rows[0].id as string;
}

async function seedBookmarks(client: ClientLike, workspaceId: string) {
  const categories: Array<{
    name: string;
    bookmarks: Array<{ name: string; url: string; description: string }>;
  }> = [
    {
      name: `${DEMO_MARKER}Инфраструктура`,
      bookmarks: [
        {
          name: "pfSense",
          url: "https://pfsense.local",
          description: "Межсетевой экран и маршрутизатор",
        },
        {
          name: "Proxmox",
          url: "https://proxmox.local:8006",
          description: "Гипервизор виртуализации",
        },
        {
          name: "TrueNAS",
          url: "https://truenas.local",
          description: "Хранилище и резервное копирование",
        },
        {
          name: "Grafana",
          url: "https://grafana.local",
          description: "Дашборды и визуализация метрик",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Разработка`,
      bookmarks: [
        {
          name: "GitHub",
          url: "https://github.com",
          description: "Хостинг репозиториев и CI/CD",
        },
        {
          name: "GitLab",
          url: "https://gitlab.local",
          description: "Внутренний git-сервер",
        },
        {
          name: "Docker Hub",
          url: "https://hub.docker.com",
          description: "Реестр образов контейнеров",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Мониторинг`,
      bookmarks: [
        {
          name: "Uptime Kuma",
          url: "https://uptime.local",
          description: "Мониторинг доступности сервисов",
        },
        {
          name: "Netdata",
          url: "https://netdata.local",
          description: "Мониторинг производительности в реальном времени",
        },
      ],
    },
  ];

  for (let ci = 0; ci < categories.length; ci++) {
    const category = categories[ci];
    const existing = await client.query(
      'SELECT id FROM "Category" WHERE "workspaceId" = $1 AND name = $2',
      [workspaceId, category.name],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(
        `Demo seed: category "${category.name}" already exists — skipping.`,
      );
      continue;
    }

    const categoryId = randomUUID();
    await client.query(
      'INSERT INTO "Category" (id, "workspaceId", name, position, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, now(), now())',
      [categoryId, workspaceId, category.name, ci],
    );

    for (let bi = 0; bi < category.bookmarks.length; bi++) {
      const bookmark = category.bookmarks[bi];
      await client.query(
        'INSERT INTO "Bookmark" (id, "workspaceId", "categoryId", "categoryWorkspaceId", name, url, description, position, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())',
        [
          randomUUID(),
          workspaceId,
          categoryId,
          workspaceId,
          bookmark.name,
          bookmark.url,
          bookmark.description,
          bi,
        ],
      );
    }
    console.log(
      `Demo seed: created category "${category.name}" with ${category.bookmarks.length} bookmarks.`,
    );
  }
}

async function seedLogs(client: ClientLike, workspaceId: string) {
  const marker = `${DEMO_MARKER}nginx`;
  const existing = await client.query(
    'SELECT id FROM "LogEntry" WHERE "workspaceId" = $1 AND source = $2 LIMIT 1',
    [workspaceId, marker],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: log entries already exist — skipping.");
    return;
  }

  const entries: Array<{ level: string; source: string; message: string }> = [
    {
      level: "info",
      source: marker,
      message: "Сервер запущен, слушает порт 443",
    },
    {
      level: "info",
      source: "postgresql",
      message: "database system is ready to accept connections",
    },
    {
      level: "warning",
      source: "docker",
      message: "Контейнер inspoter-app перезапущен после OOM",
    },
    {
      level: "error",
      source: marker,
      message: "upstream timed out while reading response header",
    },
    {
      level: "info",
      source: "cron",
      message: "Backup job completed successfully",
    },
    {
      level: "warning",
      source: "postgresql",
      message: "checkpoints are occurring too frequently",
    },
    {
      level: "info",
      source: "docker",
      message: "Pulled image grafana/grafana:latest",
    },
    {
      level: "error",
      source: "cron",
      message: "Не удалось выполнить задачу очистки логов: permission denied",
    },
    {
      level: "info",
      source: marker,
      message: "SSL certificate renewed for *.local",
    },
    {
      level: "warning",
      source: marker,
      message: "client sent invalid method while reading client request line",
    },
    {
      level: "info",
      source: "postgresql",
      message: "automatic vacuum of table completed",
    },
    {
      level: "error",
      source: "docker",
      message: "network inspoter_default not found",
    },
    {
      level: "info",
      source: "cron",
      message: "Запущена ежедневная задача резервного копирования",
    },
    {
      level: "warning",
      source: "postgresql",
      message: "connection limit reached for role app_user",
    },
    {
      level: "info",
      source: marker,
      message: "Конфигурация перезагружена без простоя",
    },
  ];

  const now = Date.now();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const timestamp = new Date(now - (entries.length - i) * 15 * 60 * 1000);
    await client.query(
      'INSERT INTO "LogEntry" (id, "workspaceId", level, source, message, timestamp, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [
        randomUUID(),
        workspaceId,
        entry.level,
        entry.source,
        entry.message,
        timestamp,
      ],
    );
  }
  console.log(`Demo seed: created ${entries.length} log entries.`);
}

async function seedAlerts(client: ClientLike, workspaceId: string) {
  const categories: Array<{
    name: string;
    alerts: Array<{ severity: string; source: string; message: string }>;
  }> = [
    {
      name: `${DEMO_MARKER}Сеть`,
      alerts: [
        {
          severity: "warning",
          source: "monitoring",
          message: "Высокая задержка на канале до дата-центра",
        },
        {
          severity: "critical",
          source: "firewall",
          message: "Обнаружена попытка перебора паролей SSH",
        },
        {
          severity: "info",
          source: "monitoring",
          message: "Пропускная способность восстановлена до нормы",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Диски`,
      alerts: [
        {
          severity: "warning",
          source: "disk-check",
          message: "Заполнение раздела /var превысило 80%",
        },
        {
          severity: "error",
          source: "disk-check",
          message: "SMART: обнаружены сбойные секторы на /dev/sdb",
        },
        {
          severity: "info",
          source: "disk-check",
          message: "Очистка временных файлов освободила 4.2 ГБ",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Безопасность`,
      alerts: [
        {
          severity: "critical",
          source: "firewall",
          message: "Заблокирован трафик с известного вредоносного IP",
        },
        {
          severity: "warning",
          source: "monitoring",
          message: "Истекает срок действия TLS-сертификата через 7 дней",
        },
      ],
    },
  ];

  const existing = await client.query(
    'SELECT id FROM "AlertCategory" WHERE "workspaceId" = $1 AND name = $2',
    [workspaceId, categories[0].name],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: alert categories already exist — skipping.");
    return;
  }

  const now = Date.now();
  let alertIndex = 0;
  for (const category of categories) {
    const categoryId = randomUUID();
    await client.query(
      'INSERT INTO "AlertCategory" (id, "workspaceId", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
      [categoryId, workspaceId, category.name],
    );

    for (const alert of category.alerts) {
      alertIndex++;
      const timestamp = new Date(now - alertIndex * 20 * 60 * 1000);
      await client.query(
        'INSERT INTO "Alert" (id, "workspaceId", "alertCategoryId", "alertCategoryWorkspaceId", severity, source, message, timestamp, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())',
        [
          randomUUID(),
          workspaceId,
          categoryId,
          workspaceId,
          alert.severity,
          alert.source,
          alert.message,
          timestamp,
        ],
      );
    }
  }
  console.log(
    `Demo seed: created ${categories.length} alert categories with ${alertIndex} alerts.`,
  );
}

async function seedMail(client: ClientLike, workspaceId: string) {
  const marker = "notifications@server.local";
  const existing = await client.query(
    'SELECT id FROM "MailItem" WHERE "workspaceId" = $1 AND sender = $2 LIMIT 1',
    [workspaceId, marker],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: mail items already exist — skipping.");
    return;
  }

  const items: Array<{ sender: string; subject: string; body: string }> = [
    {
      sender: marker,
      subject: "Резервное копирование завершено успешно",
      body: "Еженедельное резервное копирование базы данных завершено. Размер архива: 3.4 ГБ.",
    },
    {
      sender: "admin@example.com",
      subject: "Требуется обновление системы",
      body: "Доступно обновление безопасности для ядра. Рекомендуется установить в ближайшее плановое окно.",
    },
    {
      sender: marker,
      subject: "Сертификат TLS будет обновлён автоматически",
      body: "Сертификат для *.local будет автоматически продлён через Let's Encrypt в течение 48 часов.",
    },
    {
      sender: "admin@example.com",
      subject: "Новый участник добавлен в рабочее пространство",
      body: "Пользователь был добавлен в рабочее пространство с ролью MEMBER.",
    },
    {
      sender: marker,
      subject: "Резервное копирование: предупреждение",
      body: "Резервное копирование завершено с предупреждениями: 2 файла пропущены из-за занятости.",
    },
    {
      sender: "billing@example.com",
      subject: "Счёт за облачное хранилище",
      body: "Ваш счёт за текущий расчётный период доступен в личном кабинете.",
    },
    {
      sender: marker,
      subject: "Плановое обслуживание завершено",
      body: "Плановое обслуживание инфраструктуры завершено без простоя сервисов.",
    },
  ];

  const now = Date.now();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const receivedAt = new Date(now - (items.length - i) * 3 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "MailItem" (id, "workspaceId", sender, subject, body, "receivedAt", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      [
        randomUUID(),
        workspaceId,
        item.sender,
        item.subject,
        item.body,
        receivedAt,
      ],
    );
  }
  console.log(`Demo seed: created ${items.length} mail items.`);
}

async function seedMessages(client: ClientLike, workspaceId: string) {
  const structure: Array<{
    category: string;
    channels: Array<{
      name: string;
      messages: Array<{ content: string; author: string }>;
    }>;
  }> = [
    {
      category: `${DEMO_MARKER}Общее`,
      channels: [
        {
          name: "уведомления",
          messages: [
            {
              content: "Развёртывание версии 2.4.0 завершено",
              author: "ci-bot",
            },
            {
              content: "Плановые работы запланированы на выходные",
              author: "admin",
            },
            {
              content: "Добро пожаловать в новую рабочую область!",
              author: "system",
            },
          ],
        },
        {
          name: "обсуждение",
          messages: [
            {
              content: "Кто-нибудь смотрел новый дашборд мониторинга?",
              author: "operator",
            },
            {
              content: "Да, выглядит отлично, метрики диска особенно полезны",
              author: "operator",
            },
            {
              content: "Стоит добавить ещё алерты по памяти",
              author: "operator",
            },
            {
              content: "Согласен, добавлю в следующий спринт",
              author: "operator",
            },
          ],
        },
      ],
    },
    {
      category: `${DEMO_MARKER}Мониторинг`,
      channels: [
        {
          name: "алерты",
          messages: [
            {
              content: "Критический алерт по диску sdb устранён",
              author: "monitoring",
            },
            {
              content: "Задержка сети вернулась в норму",
              author: "monitoring",
            },
            {
              content: "Новое правило алертинга добавлено для CPU > 90%",
              author: "admin",
            },
          ],
        },
        {
          name: "метрики",
          messages: [
            {
              content: "Средняя загрузка CPU за неделю: 34%",
              author: "monitoring",
            },
            {
              content: "Использование диска приближается к 75%",
              author: "monitoring",
            },
            {
              content: "Сетевой трафик вырос на 12% за последний час",
              author: "monitoring",
            },
            {
              content: "Отчёт по производительности сформирован",
              author: "monitoring",
            },
            {
              content: "Все сервисы работают в штатном режиме",
              author: "monitoring",
            },
          ],
        },
      ],
    },
  ];

  const existing = await client.query(
    'SELECT id FROM "MessageCategory" WHERE "workspaceId" = $1 AND name = $2',
    [workspaceId, structure[0].category],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: message categories already exist — skipping.");
    return;
  }

  let totalMessages = 0;
  const now = Date.now();
  for (const categoryDef of structure) {
    const categoryId = randomUUID();
    await client.query(
      'INSERT INTO "MessageCategory" (id, "workspaceId", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
      [categoryId, workspaceId, categoryDef.category],
    );

    for (const channelDef of categoryDef.channels) {
      const channelId = randomUUID();
      await client.query(
        'INSERT INTO "Channel" (id, "workspaceId", "messageCategoryId", "messageCategoryWorkspaceId", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
        [channelId, workspaceId, categoryId, workspaceId, channelDef.name],
      );

      for (let mi = 0; mi < channelDef.messages.length; mi++) {
        const message = channelDef.messages[mi];
        totalMessages++;
        const createdAt = new Date(
          now - (channelDef.messages.length - mi) * 10 * 60 * 1000,
        );
        await client.query(
          'INSERT INTO "Message" (id, "workspaceId", "channelId", "channelWorkspaceId", content, author, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [
            randomUUID(),
            workspaceId,
            channelId,
            workspaceId,
            message.content,
            message.author,
            createdAt,
          ],
        );
      }
    }
  }
  console.log(
    `Demo seed: created message categories/channels with ${totalMessages} messages.`,
  );
}

async function seedWebhookToken(client: ClientLike, workspaceId: string) {
  const name = `${DEMO_MARKER}Demo Token`;
  const existing = await client.query(
    'SELECT id FROM "WebhookToken" WHERE "workspaceId" = $1 AND name = $2',
    [workspaceId, name],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: webhook token already exists — skipping.");
    return;
  }

  const secret = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const tokenPrefix = secret.slice(0, 12);

  await client.query(
    'INSERT INTO "WebhookToken" (id, "workspaceId", name, "tokenHash", "tokenPrefix", "createdAt") VALUES ($1, $2, $3, $4, $5, now())',
    [randomUUID(), workspaceId, name, tokenHash, tokenPrefix],
  );
  console.log(
    `Demo seed: created webhook token "${name}" (secret not persisted, shown once here): ${secret}`,
  );
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const workspaceId = await findWorkspace(client);
    console.log(`Demo seed: using workspace ${workspaceId}.`);

    await seedBookmarks(client, workspaceId);
    await seedLogs(client, workspaceId);
    await seedAlerts(client, workspaceId);
    await seedMail(client, workspaceId);
    await seedMessages(client, workspaceId);
    await seedWebhookToken(client, workspaceId);

    console.log("Demo seed: complete.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
