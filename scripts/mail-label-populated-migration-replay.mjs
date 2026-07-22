import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  captureDatabaseSnapshot,
  compareProtectedSnapshots,
  guardedTestEnvironment,
  seedPopulatedPhase4Fixture,
  verifyPhase5DatabaseContract,
  writeEvidence,
} from "./mail-label-phase5-evidence-lib.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve("prisma/build/index.js");
const PRISMA_CONFIG_MODULE = require.resolve("prisma/config");

function runNode(args, environment, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: REPOSITORY_ROOT,
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", () => {
      rejectPromise(new Error(`${label} could not start.`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const outcome =
        signal === null ? `exit code ${code}` : `signal ${signal}`;
      rejectPromise(new Error(`${label} failed (${outcome}).`));
    });
  });
}

async function resetGuardedDatabase(connectionString, expectedDatabase) {
  const client = new Client({ connectionString });
  await client.connect();
  let transactionStarted = false;
  try {
    const identity = await client.query(
      `SELECT current_database() AS database`,
    );
    if (identity.rows[0]?.database !== expectedDatabase) {
      throw new Error("Connected database is not the guarded test database.");
    }
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function findPhase5Migration(migrationsPath) {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const sqlPath = join(migrationsPath, entry.name, "migration.sql");
    let sql;
    try {
      sql = await readFile(sqlPath, "utf8");
    } catch {
      continue;
    }
    if (sql.includes('CREATE TABLE "MailFilterRun"')) return entry.name;
  }
  throw new Error("Phase 5 MailFilterRun migration was not found.");
}

async function main() {
  const { environment, target } = guardedTestEnvironment();
  const migrationsPath = resolve(REPOSITORY_ROOT, "prisma", "migrations");
  const phase5Migration = await findPhase5Migration(migrationsPath);
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "inspoter-phase5-replay-"),
  );
  const temporaryPrisma = join(temporaryRoot, "prisma");

  try {
    await cp(resolve(REPOSITORY_ROOT, "prisma"), temporaryPrisma, {
      recursive: true,
    });
    const excludedMigration = join(
      temporaryPrisma,
      "migrations",
      phase5Migration,
    );
    if (!excludedMigration.startsWith(temporaryRoot)) {
      throw new Error("Temporary migration path escaped its disposable root.");
    }
    await rm(excludedMigration, { recursive: true });

    const temporaryConfig = join(temporaryRoot, "prisma.config.mjs");
    const temporarySchema = join(temporaryPrisma, "schema.prisma");
    const temporaryMigrations = join(temporaryPrisma, "migrations");
    await writeFile(
      temporaryConfig,
      `import { defineConfig } from ${JSON.stringify(
        pathToFileURL(PRISMA_CONFIG_MODULE).href,
      )};\n\nexport default defineConfig({\n  schema: ${JSON.stringify(
        temporarySchema,
      )},\n  migrations: { path: ${JSON.stringify(
        temporaryMigrations,
      )} },\n  datasource: { url: process.env.DATABASE_URL },\n});\n`,
      "utf8",
    );

    await resetGuardedDatabase(environment.DATABASE_URL, target.database);
    await runNode(
      [
        PRISMA_CLI,
        "migrate",
        "deploy",
        "--config",
        temporaryConfig,
        "--schema",
        temporarySchema,
      ],
      environment,
      "Phase 4 baseline migration replay",
    );
    await runNode(
      [resolve(REPOSITORY_ROOT, "prisma", "seed.ts")],
      environment,
      "Base seed",
    );
    const fixture = await seedPopulatedPhase4Fixture(environment.DATABASE_URL);
    const before = await captureDatabaseSnapshot(environment.DATABASE_URL);

    await runNode(
      [
        PRISMA_CLI,
        "migrate",
        "deploy",
        "--config",
        resolve(REPOSITORY_ROOT, "prisma.config.ts"),
        "--schema",
        resolve(REPOSITORY_ROOT, "prisma", "schema.prisma"),
      ],
      environment,
      "Phase 5 populated migration",
    );

    const after = await captureDatabaseSnapshot(environment.DATABASE_URL);
    const differences = compareProtectedSnapshots(before, after);
    if (differences.length > 0) {
      throw new Error(
        `Protected Mail data changed during migration:\n${differences.join("\n")}`,
      );
    }
    if ((after.tables.MailFilterRun?.count ?? -1) !== 0) {
      throw new Error("MailFilterRun was not empty after additive migration.");
    }
    const contract = await verifyPhase5DatabaseContract(
      environment.DATABASE_URL,
    );
    const evidence = {
      status: "PASS",
      target: target.sanitizedTarget,
      excludedDuringBaseline: phase5Migration,
      fixture,
      before,
      after,
      protectedDataDifferences: differences,
      contract,
    };
    const evidencePath = await writeEvidence(
      "populated-migration-replay.json",
      evidence,
    );
    console.log(
      `[mail-label-phase5] populated migration replay passed; evidence ${basename(
        evidencePath,
      )}.`,
    );
  } finally {
    if (temporaryRoot.startsWith(tmpdir())) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`[mail-label-phase5] ${error.message}`);
  process.exitCode = 1;
});
