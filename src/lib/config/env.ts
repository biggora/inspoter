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
    SERVICE_SCHEDULER_TICK_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15000),
    OPERATOR_USERNAME: z.string().min(1, "OPERATOR_USERNAME is required"),
    OPERATOR_PASSWORD_HASH: z.string().min(1).optional(),
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

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
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
