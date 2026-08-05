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
      name: `${DEMO_MARKER}Infrastructure`,
      bookmarks: [
        {
          name: "pfSense",
          url: "https://pfsense.local",
          description: "Firewall and router",
        },
        {
          name: "Proxmox",
          url: "https://proxmox.local:8006",
          description: "Virtualization hypervisor",
        },
        {
          name: "TrueNAS",
          url: "https://truenas.local",
          description: "Storage and backups",
        },
        {
          name: "Grafana",
          url: "https://grafana.local",
          description: "Dashboards and metric visualization",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Development`,
      bookmarks: [
        {
          name: "GitHub",
          url: "https://github.com",
          description: "Repository hosting and CI/CD",
        },
        {
          name: "GitLab",
          url: "https://gitlab.local",
          description: "Internal git server",
        },
        {
          name: "Docker Hub",
          url: "https://hub.docker.com",
          description: "Container image registry",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Monitoring`,
      bookmarks: [
        {
          name: "Uptime Kuma",
          url: "https://uptime.local",
          description: "Service availability monitoring",
        },
        {
          name: "Netdata",
          url: "https://netdata.local",
          description: "Real-time performance monitoring",
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
      message: "Server started, listening on port 443",
    },
    {
      level: "info",
      source: "postgresql",
      message: "database system is ready to accept connections",
    },
    {
      level: "warning",
      source: "docker",
      message: "Container inspoter-app restarted after OOM",
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
      message: "Log cleanup job failed: permission denied",
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
      message: "Daily backup job started",
    },
    {
      level: "warning",
      source: "postgresql",
      message: "connection limit reached for role app_user",
    },
    {
      level: "info",
      source: marker,
      message: "Configuration reloaded with no downtime",
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
      name: `${DEMO_MARKER}Network`,
      alerts: [
        {
          severity: "warning",
          source: "monitoring",
          message: "High latency on the link to the data centre",
        },
        {
          severity: "critical",
          source: "firewall",
          message: "SSH password brute-force attempt detected",
        },
        {
          severity: "info",
          source: "monitoring",
          message: "Throughput is back to normal",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Disks`,
      alerts: [
        {
          severity: "warning",
          source: "disk-check",
          message: "The /var partition is over 80% full",
        },
        {
          severity: "error",
          source: "disk-check",
          message: "SMART: bad sectors found on /dev/sdb",
        },
        {
          severity: "info",
          source: "disk-check",
          message: "Temporary file cleanup freed 4.2 GB",
        },
      ],
    },
    {
      name: `${DEMO_MARKER}Security`,
      alerts: [
        {
          severity: "critical",
          source: "firewall",
          message: "Blocked traffic from a known malicious IP",
        },
        {
          severity: "warning",
          source: "monitoring",
          message: "The TLS certificate expires in 7 days",
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
      'INSERT INTO "AlertCategory" (id, "workspaceId", name, "normalizedName", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, now(), now())',
      [categoryId, workspaceId, category.name, category.name.toLowerCase()],
    );

    for (const alert of category.alerts) {
      alertIndex++;
      const timestamp = new Date(now - alertIndex * 20 * 60 * 1000);
      await client.query(
        'INSERT INTO "Alert" (id, "workspaceId", "alertCategoryId", "alertCategoryWorkspaceId", "categorySource", severity, source, message, timestamp, "createdAt") VALUES ($1, $2, $3, $4, \'WEBHOOK\', $5, $6, $7, $8, now())',
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

// System webhook mailbox (account + INBOX folder) the demo mail lands in.
// Mirrors src/lib/services/mail-accounts.ts getOrCreateWebhookAccount().
async function ensureWebhookMailbox(
  client: ClientLike,
  workspaceId: string,
): Promise<{ accountId: string; folderId: string }> {
  const account = await client.query(
    'SELECT id FROM "MailAccount" WHERE "workspaceId" = $1 AND kind = \'WEBHOOK\' LIMIT 1',
    [workspaceId],
  );
  let accountId: string;
  if (account.rowCount && account.rowCount > 0) {
    accountId = account.rows[0].id as string;
  } else {
    accountId = randomUUID();
    await client.query(
      "INSERT INTO \"MailAccount\" (id, \"workspaceId\", kind, mode, name, email, \"syncStatus\", \"updatedAt\") VALUES ($1, $2, 'WEBHOOK', 'REAL', 'Webhook', '', 'IDLE', now())",
      [accountId, workspaceId],
    );
  }

  const folder = await client.query(
    'SELECT id FROM "MailFolder" WHERE "accountId" = $1 AND path = \'INBOX\' LIMIT 1',
    [accountId],
  );
  let folderId: string;
  if (folder.rowCount && folder.rowCount > 0) {
    folderId = folder.rows[0].id as string;
  } else {
    folderId = randomUUID();
    await client.query(
      'INSERT INTO "MailFolder" (id, "workspaceId", "accountId", "accountWorkspaceId", path, name, "specialUse", position, "updatedAt") VALUES ($1, $2, $3, $2, \'INBOX\', \'Inbox\', \'INBOX\', 0, now())',
      [folderId, workspaceId, accountId],
    );
  }

  return { accountId, folderId };
}

async function seedMail(client: ClientLike, workspaceId: string) {
  const marker = "notifications@server.local";
  const existing = await client.query(
    'SELECT id FROM "MailItem" WHERE "workspaceId" = $1 AND "fromAddress" = $2 LIMIT 1',
    [workspaceId, marker],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Demo seed: mail items already exist — skipping.");
    return;
  }

  const { accountId, folderId } = await ensureWebhookMailbox(
    client,
    workspaceId,
  );

  const items: Array<{ sender: string; subject: string; body: string }> = [
    {
      sender: marker,
      subject: "Backup completed successfully",
      body: "The weekly database backup has finished. Archive size: 3.4 GB.",
    },
    {
      sender: "admin@example.com",
      subject: "System update required",
      body: "A kernel security update is available. Install it in the next scheduled window.",
    },
    {
      sender: marker,
      subject: "The TLS certificate renews automatically",
      body: "The certificate for *.local will be renewed through Let's Encrypt within 48 hours.",
    },
    {
      sender: "admin@example.com",
      subject: "A new member joined the workspace",
      body: "The user was added to the workspace with the MEMBER role.",
    },
    {
      sender: marker,
      subject: "Backup: warning",
      body: "The backup finished with warnings: 2 files were skipped because they were in use.",
    },
    {
      sender: "billing@example.com",
      subject: "Cloud storage invoice",
      body: "Your invoice for the current billing period is available in your account.",
    },
    {
      sender: marker,
      subject: "Scheduled maintenance completed",
      body: "Scheduled infrastructure maintenance finished with no service downtime.",
    },
  ];

  const now = Date.now();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const receivedAt = new Date(now - (items.length - i) * 3 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "MailItem" (id, "workspaceId", "accountId", "accountWorkspaceId", "folderId", "folderWorkspaceId", "fromAddress", subject, "bodyText", snippet, "receivedAt", "createdAt") VALUES ($1, $2, $3, $2, $4, $2, $5, $6, $7, left($7, 120), $8, now())',
      [
        randomUUID(),
        workspaceId,
        accountId,
        folderId,
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
      category: `${DEMO_MARKER}General`,
      channels: [
        {
          name: "announcements",
          messages: [
            {
              content: "Version 2.4.0 has finished deploying",
              author: "ci-bot",
            },
            {
              content: "Scheduled maintenance is planned for the weekend",
              author: "admin",
            },
            {
              content: "Welcome to the new workspace!",
              author: "system",
            },
          ],
        },
        {
          name: "discussion",
          messages: [
            {
              content: "Has anyone looked at the new monitoring dashboard?",
              author: "operator",
            },
            {
              content:
                "Yes, it looks great — the disk metrics are especially useful",
              author: "operator",
            },
            {
              content: "We should add memory alerts too",
              author: "operator",
            },
            {
              content: "Agreed, I'll add them next sprint",
              author: "operator",
            },
          ],
        },
      ],
    },
    {
      category: `${DEMO_MARKER}Monitoring`,
      channels: [
        {
          name: "alerts",
          messages: [
            {
              content: "The critical sdb disk alert is resolved",
              author: "monitoring",
            },
            {
              content: "Network latency is back to normal",
              author: "monitoring",
            },
            {
              content: "Added a new alerting rule for CPU > 90%",
              author: "admin",
            },
          ],
        },
        {
          name: "metrics",
          messages: [
            {
              content: "Average CPU load for the week: 34%",
              author: "monitoring",
            },
            {
              content: "Disk usage is approaching 75%",
              author: "monitoring",
            },
            {
              content: "Network traffic grew 12% in the last hour",
              author: "monitoring",
            },
            {
              content: "The performance report has been generated",
              author: "monitoring",
            },
            {
              content: "All services are operating normally",
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
