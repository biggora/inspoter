import "dotenv/config";
import { Client } from "pg";

const LOCK_KEY = 1_937_104_711;

export async function preserveLegacyAgentTokens(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const tables = await client.query(
      `SELECT
        to_regclass('"ServerAgentToken"') IS NOT NULL AS legacy,
        to_regclass('"WebhookToken"') IS NOT NULL AS universal`,
    );
    if (!tables.rows[0]?.legacy || !tables.rows[0]?.universal) {
      await client.query("COMMIT");
      return 0;
    }

    const copied = await client.query(`
      INSERT INTO "WebhookToken" (
        "id", "workspaceId", "channelId", "channelWorkspaceId", "name",
        "tokenHash", "tokenPrefix", "createdAt", "revokedAt", "lastUsedAt"
      )
      SELECT
        'legacy-agent-' || s."id", s."workspaceId", NULL, NULL, s."name",
        s."tokenHash", s."tokenPrefix", s."createdAt",
        CASE
          WHEN s."revokedAt" IS NOT NULL THEN s."revokedAt"
          WHEN s."expiresAt" IS NOT NULL AND s."expiresAt" <= CURRENT_TIMESTAMP
            THEN s."expiresAt"
          WHEN s."state"::text = 'REVOKED' THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
        s."lastUsedAt"
      FROM "ServerAgentToken" s
      ON CONFLICT ("tokenHash") DO NOTHING
    `);
    await client.query("COMMIT");
    return copied.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const copied = await preserveLegacyAgentTokens(databaseUrl);
  console.log(
    `[migration-preflight] preserved ${copied} legacy agent token(s).`,
  );
}

if (process.argv[1]?.endsWith("legacy-agent-token-preflight.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Preflight failed");
    process.exitCode = 1;
  });
}
