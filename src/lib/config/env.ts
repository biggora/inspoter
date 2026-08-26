import { z } from "zod";

// Base infra + auth env contract (architecture.md §5.2, plan.md §4.2 item 6,
// §5.3 step 1). Parsed once at import time; throws (fail-fast) on
// invalid/missing required vars — the app must never boot into a broken or
// unauthenticated-by-accident state (AC-AUTH-005, N-8b).
//
// Auth contract: OPERATOR_USERNAME is required, plus exactly one of
// OPERATOR_PASSWORD_HASH (preferred — used as-is) / OPERATOR_PASSWORD
// (plaintext convenience, hashed in memory by src/lib/auth/password.ts).
// When both are supplied, OPERATOR_PASSWORD_HASH wins (architecture §5.2) —
// callers (prisma/seed.ts, src/lib/auth/password.ts) read the raw
// OPERATOR_PASSWORD_HASH/OPERATOR_PASSWORD fields below and apply that
// precedence themselves; env.ts's job is only to fail fast when neither is
// present.

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    LIST_PAGE_SIZE: z.coerce.number().int().positive().default(50),
    WEBHOOK_RATE_LIMIT: z.coerce.number().int().positive().default(120),
    WEBHOOK_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().default(65_536),
    LOGIN_RATE_LIMIT_IP: z.coerce.number().int().positive().default(30),
    LOGIN_RATE_LIMIT_USERNAME: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    LOGIN_TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SERVICE_SCHEDULER_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15000),
    // --- Outgoing webhooks (durable delivery queue + scheduler) ---
    WEBHOOK_SCHEDULER_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10_000),
    WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10_000),
    WEBHOOK_DELIVERY_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    WEBHOOK_DELIVERY_LEASE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
    WEBHOOK_DELIVERY_BATCH: z.coerce.number().int().positive().default(50),
    // Consecutive terminal failures before an outgoing webhook is disabled
    // automatically (specs/discord-webhook-compatibility.md §7).
    WEBHOOK_AUTO_DISABLE_AFTER: z.coerce.number().int().positive().default(10),
    WEBHOOK_DELIVERY_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    WEBHOOK_DELIVERY_RETENTION_BATCH: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    WEBHOOK_DELIVERY_RETENTION_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000), // hourly — a cleanup sweep, not latency sensitive
    // --- Log retention ---
    LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    LOG_RETENTION_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000), // hourly
    // --- Mail client (plan «mail», §2/§3: sync + send limits) ---
    MAIL_SYNC_TICK_MS: z.coerce.number().int().positive().default(30_000),
    MAIL_INITIAL_SYNC_LIMIT: z.coerce.number().int().positive().default(200),
    MAIL_SYNC_BATCH_SIZE: z.coerce.number().int().positive().default(10),
    MAIL_MAX_MESSAGE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5_242_880),
    MAIL_MAX_BODY_BYTES: z.coerce.number().int().positive().default(5_242_880),
    // Consecutive failed syncs before an account is marked ERROR and alerted
    // on. Each sync already retries the transport once, so the default means
    // six failed IMAP sessions in a row.
    MAIL_SYNC_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
    MAIL_MAX_ATTACHMENT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(26_214_400),
    MAIL_SEND_RATE_LIMIT: z.coerce.number().int().positive().default(30),
    MAIL_SEND_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    // --- Server metrics agent (specs/metrics-script.md §6.5) ---
    SERVER_METRICS_RATE_LIMIT: z.coerce.number().int().positive().default(12),
    SERVER_METRICS_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    METRICS_STALENESS_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(180_000),
    // --- Server metric history retention (server detail charts) ---
    // The agent pushes once a minute, so one server writes ~1440 sample rows a
    // day; 30 days is the deepest range the detail page offers.
    // Zero is allowed here (unlike the other retention knobs) so an operator
    // can disable history entirely.
    SERVER_METRICS_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(30),
    SERVER_METRICS_RETENTION_BATCH: z.coerce
      .number()
      .int()
      .positive()
      .default(5_000),
    SERVER_METRICS_RETENTION_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000), // hourly
    // --- Provider listing cache (provider-snapshots.ts) ---
    // How long a cached listing is served without a refresh. The scheduler
    // ticks more often than the TTL so a snapshot is never much older than
    // TTL + one tick.
    PROVIDER_SNAPSHOT_TTL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(300_000), // 5 minutes
    PROVIDER_SNAPSHOT_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    // --- LLM provider (src/lib/llm) ---
    // The endpoint and its API key are per-workspace credentials, never env
    // vars; only these transport/abuse bounds are deployment-wide. The rate
    // limit follows MAIL_SEND_RATE_LIMIT: a fixed window per workspace.
    LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    LLM_CALL_RATE_LIMIT: z.coerce.number().int().positive().default(60),
    LLM_CALL_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    // Agent runs get their own window. One run is N model calls (one per step),
    // so sharing the interactive counter would let a handful of scheduled runs
    // silently take the Mail AI features offline for the rest of the hour.
    LLM_AGENT_CALL_RATE_LIMIT: z.coerce.number().int().positive().default(600),
    LLM_AGENT_CALL_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    LLM_QUERY_EMBED_RATE_LIMIT: z.coerce.number().int().positive().default(120),
    LLM_INDEX_EMBED_RATE_LIMIT: z.coerce.number().int().positive().default(600),
    // --- AI Assistant runs (src/lib/agents) ---
    // Deployment-wide ceilings. Each agent carries its own limits; a run uses
    // the smaller of the two, so one workspace cannot configure its way out of
    // the envelope this deployment is willing to pay for.
    AGENT_RUN_MAX_STEPS_CEILING: z.coerce.number().int().positive().default(24),
    AGENT_RUN_MAX_TOKENS_CEILING: z.coerce
      .number()
      .int()
      .positive()
      .default(200_000),
    AGENT_RUN_MAX_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_800),
    // What one tool may put into the model's context, and what a step row may
    // keep for the timeline. The first is a token bill, the second is a table.
    AGENT_TOOL_RESULT_MAX_CHARS: z.coerce
      .number()
      .int()
      .positive()
      .default(6_000),
    AGENT_STEP_PAYLOAD_MAX_CHARS: z.coerce
      .number()
      .int()
      .positive()
      .default(4_000),
    AGENT_CHAT_HISTORY_MAX_CHARS: z.coerce
      .number()
      .int()
      .positive()
      .default(24_000),
    AGENT_RAG_CONTEXT_MAX_CHARS: z.coerce
      .number()
      .int()
      .positive()
      .default(12_000),
    NOTE_INDEX_SCHEDULER_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5_000),
    NOTE_INDEX_JOB_BATCH: z.coerce.number().int().positive().default(10),
    // A run holds its lease across N model round-trips, so the lease is
    // minutes rather than the seconds a webhook delivery needs.
    AGENT_RUN_LEASE_MS: z.coerce.number().int().positive().default(120_000),
    AGENT_RUN_BATCH: z.coerce.number().int().positive().default(5),
    AGENT_SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(15_000),
    AGENT_SCHEDULE_BATCH: z.coerce.number().int().positive().default(20),
    // Terminal runs older than this are pruned; their steps go with them
    // through the cascade. PENDING and RUNNING rows are never eligible.
    AGENT_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    AGENT_RUN_RETENTION_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
    AGENT_MAX_CONCURRENT_RUNS_PER_WORKSPACE: z.coerce
      .number()
      .int()
      .positive()
      .default(2),
    // --- Backup import limits ---
    BACKUP_MAX_IMPORT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(52_428_800), // 50 MiB
    BACKUP_IMPORT_TX_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    // --- Contacts import limits ---
    // An address book is text; 10 MiB is a five-figure contact count, and the
    // row cap is what actually protects the database.
    CONTACTS_MAX_IMPORT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10_485_760), // 10 MiB
    CONTACTS_MAX_IMPORT_ROWS: z.coerce
      .number()
      .int()
      .positive()
      .default(10_000),
    CONTACTS_MAX_PHOTO_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2_097_152), // 2 MiB
    OPERATOR_USERNAME: z.string().min(1, "OPERATOR_USERNAME is required"),
    // Preprocessed so an explicitly blanked "" (scripts/test-env.mjs blanks
    // this in test child environments to stop prisma.config.ts's dotenv
    // import from leaking a developer's real .env value into test seeding)
    // is treated the same as "not set", not as an invalid value.
    OPERATOR_PASSWORD_HASH: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    OPERATOR_PASSWORD: z.string().min(1).optional(),
    // --- Authentik SSO (third-party auth, optional — absent = disabled) ---
    AUTHENTIK_ISSUER: z.string().url().optional(),
    AUTHENTIK_CLIENT_ID: z.string().min(1).optional(),
    AUTHENTIK_CLIENT_SECRET: z.string().min(1).optional(),
    AUTHENTIK_REDIRECT_URI: z.string().url().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.OPERATOR_PASSWORD_HASH) || Boolean(data.OPERATOR_PASSWORD),
    {
      message:
        "Exactly one of OPERATOR_PASSWORD_HASH or OPERATOR_PASSWORD is required",
      path: ["OPERATOR_PASSWORD_HASH"],
    },
  )
  .refine(
    (data) => {
      const values = [
        data.AUTHENTIK_ISSUER,
        data.AUTHENTIK_CLIENT_ID,
        data.AUTHENTIK_CLIENT_SECRET,
        data.AUTHENTIK_REDIRECT_URI,
      ];
      const present = values.filter(Boolean).length;
      return present === 0 || present === values.length;
    },
    {
      message:
        "AUTHENTIK_ISSUER, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, and AUTHENTIK_REDIRECT_URI must all be set together, or all omitted (Authentik login disabled)",
      path: ["AUTHENTIK_ISSUER"],
    },
  );

// Compose renders an unset `${VAR:-}` as an empty string instead of leaving
// the variable out, and `z.coerce.number()` turns "" into 0 — so every
// optional numeric knob listed in docker-compose.prod.yml failed .positive()
// and stopped the container from booting, and the four AUTHENTIK_* vars failed
// .url(). An empty value means "not set" for the whole contract, which is what
// OPERATOR_PASSWORD_HASH's preprocess above already assumed for itself.
function withoutBlanks(
  source: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
}

function loadEnv() {
  const parsed = envSchema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  if (parsed.data.OPERATOR_PASSWORD_HASH && parsed.data.OPERATOR_PASSWORD) {
    console.warn(
      "Both OPERATOR_PASSWORD_HASH and OPERATOR_PASSWORD are set — " +
        "OPERATOR_PASSWORD_HASH wins and OPERATOR_PASSWORD is ignored " +
        "(architecture.md §5.2).",
    );
  }

  return parsed.data;
}

export const env = loadEnv();

// True when all four AUTHENTIK_* vars are configured (see refine above —
// they're validated as an all-or-nothing group, so checking one is enough).
export const authentikEnabled = Boolean(env.AUTHENTIK_ISSUER);
