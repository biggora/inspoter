import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preserveLegacyAgentTokens } from "../../../scripts/legacy-agent-token-preflight.mjs";

const schema = `legacy_token_${randomUUID().replaceAll("-", "")}`;
let client: Client;
let scopedUrl: string;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(
    `CREATE TYPE "${schema}"."ServerAgentTokenState" AS ENUM ('UNBOUND', 'BOUND', 'REVOKED')`,
  );
  await client.query(`CREATE TABLE "${schema}"."ServerAgentToken" (
    "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE, "tokenPrefix" TEXT NOT NULL,
    "state" "${schema}"."ServerAgentTokenState" NOT NULL,
    "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3)
  )`);
  await client.query(`CREATE TABLE "${schema}"."WebhookToken" (
    "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "channelId" TEXT,
    "channelWorkspaceId" TEXT, "name" TEXT NOT NULL, "tokenHash" TEXT UNIQUE,
    "tokenPrefix" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3), "lastUsedAt" TIMESTAMP(3)
  )`);
  await client.query(`INSERT INTO "${schema}"."ServerAgentToken" VALUES
    ('active', 'workspace', 'Active', 'hash-active', 'active', 'BOUND', NULL, now(), now(), NULL),
    ('expired', 'workspace', 'Expired', 'hash-expired', 'expired', 'UNBOUND', now() - interval '1 minute', now() - interval '1 hour', NULL, NULL)`);
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  scopedUrl = url.toString();
});

afterAll(async () => {
  await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
});

describe("legacy agent token migration preflight", () => {
  it("preserves active and expired state and is replay-safe", async () => {
    expect(await preserveLegacyAgentTokens(scopedUrl)).toBe(2);
    expect(await preserveLegacyAgentTokens(scopedUrl)).toBe(0);
    const rows = await client.query(
      `SELECT "tokenHash", "revokedAt" FROM "${schema}"."WebhookToken" ORDER BY "tokenHash"`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      tokenHash: "hash-active",
      revokedAt: null,
    });
    expect(rows.rows[1].revokedAt).toBeInstanceOf(Date);

    const publishedMigration = await readFile(
      new URL(
        "../../../prisma/migrations/20260724100000_universal_api_tokens/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(publishedMigration);
    expect(
      await client.query(`SELECT count(*)::int AS count FROM "WebhookToken"`),
    ).toMatchObject({ rows: [{ count: 2 }] });
  });
});
