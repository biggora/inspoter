import { Client } from "pg";

/**
 * Fail-fast guard for the integration test project.
 *
 * Without this, an unreachable test database produces 29 separate Prisma
 * "Can't reach database server" stacks (or, worse, silent `beforeAll` skips
 * that mask ~⅓ of the suite as passing). Instead, probe the configured
 * DATABASE_URL exactly once before any test file loads and abort the whole
 * project with a single actionable message.
 *
 * The expected URL shape is already validated statically by
 * `validateTestDatabaseTarget` in vitest.config.ts; this file performs the
 * runtime connectivity check.
 */
export default async function integrationDbGlobalSetup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw new Error(
      [
        "Integration tests require DATABASE_URL, but it is not set.",
        "Run `pnpm test:db:up && pnpm test:db:prepare` to start the test",
        "Postgres on port 3833, or use `pnpm test:unit` for the no-DB suite.",
      ].join(" "),
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        "Integration tests cannot reach the test database.",
        `DATABASE_URL: ${databaseUrl}`,
        `Underlying error: ${reason}`,
        "",
        "Start the test database first:",
        "  pnpm test:db:up && pnpm test:db:prepare",
        "Or run the no-DB suite instead:",
        "  pnpm test:unit",
      ].join("\n"),
    );
  } finally {
    await client.end().catch(() => {});
  }
}
