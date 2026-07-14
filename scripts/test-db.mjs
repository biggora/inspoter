import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./test-env.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const require = createRequire(resolve(REPOSITORY_ROOT, "package.json"));
const PRISMA_CLI = require.resolve("prisma/build/index.js");
const TEST_DB_SCRIPT = realpathSync(
  resolve(REPOSITORY_ROOT, "scripts", "test-db.mjs"),
);

const EXPECTED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const EXPECTED_PORT = "3833";
const EXPECTED_DATABASE = "inspoter_e2e_test";
const EXPECTED_MARKER = "inspoter-e2e";
const FORBIDDEN_DATABASES = new Set([
  "inspot",
  "inspoter",
  "postgres",
  "template0",
  "template1",
]);
const COMPOSE_ARGS = [
  "compose",
  "-p",
  "inspoter-test",
  "-f",
  "docker-compose.test.yml",
];

export class TestDatabaseGuardError extends Error {
  constructor(reason) {
    super("Refusing test database operation: " + reason);
    this.name = "TestDatabaseGuardError";
  }
}

class TestDatabaseCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "TestDatabaseCommandError";
  }
}

function refuse(reason) {
  throw new TestDatabaseGuardError(reason);
}

/**
 * Pure, pre-connect validation for read-only test configuration consumers.
 */
export function validateTestDatabaseTarget(environment) {
  const rawUrl = environment.DATABASE_URL;
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    refuse("DATABASE_URL is required.");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(rawUrl);
  } catch {
    refuse("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    databaseUrl.protocol !== "postgres:" &&
    databaseUrl.protocol !== "postgresql:"
  ) {
    refuse("DATABASE_URL protocol must be postgres: or postgresql:.");
  }
  if (!EXPECTED_HOSTS.has(databaseUrl.hostname)) {
    refuse("database host must be exactly localhost or 127.0.0.1.");
  }
  if (databaseUrl.port !== EXPECTED_PORT) {
    refuse("database port must be explicitly 3833.");
  }

  let database;
  try {
    database = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    refuse("database name must be valid URL-encoded text.");
  }

  if (FORBIDDEN_DATABASES.has(database.toLowerCase())) {
    refuse("database name is explicitly forbidden for test reset.");
  }
  if (database !== EXPECTED_DATABASE || !database.endsWith("_test")) {
    refuse("database name must be exactly inspoter_e2e_test.");
  }

  const queryKeys = [...databaseUrl.searchParams.keys()];
  if (queryKeys.some((key) => key !== "schema")) {
    refuse("DATABASE_URL query may contain only schema=public.");
  }
  const schemas = databaseUrl.searchParams.getAll("schema");
  if (schemas.length > 1 || (schemas.length === 1 && schemas[0] !== "public")) {
    refuse("schema must be absent or exactly public.");
  }
  if (databaseUrl.hash) {
    refuse("DATABASE_URL fragments are not allowed.");
  }

  return {
    connectionString: rawUrl,
    host: databaseUrl.hostname,
    port: databaseUrl.port,
    database,
    schema: schemas[0] ?? "public",
    sanitizedTarget:
      databaseUrl.hostname + ":" + databaseUrl.port + "/" + database,
  };
}

/**
 * Pure, pre-connect validation for every test database mutation.
 */
export function validateTestDatabaseGuard(environment) {
  if (environment.ALLOW_TEST_DB_RESET !== "1") {
    refuse("ALLOW_TEST_DB_RESET must equal 1.");
  }
  if (environment.TEST_DATABASE_MARKER !== EXPECTED_MARKER) {
    refuse("TEST_DATABASE_MARKER must equal the dedicated test marker.");
  }

  return validateTestDatabaseTarget(environment);
}

function dockerExecutable() {
  return process.platform === "win32" ? "docker.exe" : "docker";
}

async function runChild(command, args, environment, action) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: REPOSITORY_ROOT,
      env: environment,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", () => {
      rejectPromise(
        new TestDatabaseCommandError(
          "Test database " + action + " could not start.",
        ),
      );
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const outcome =
        signal === null ? "exit code " + String(code) : "signal " + signal;
      rejectPromise(
        new TestDatabaseCommandError(
          "Test database " + action + " failed (" + outcome + ").",
        ),
      );
    });
  });
}

export async function runCompose(environment, args, action) {
  validateTestDatabaseGuard(environment);
  await runChild(
    dockerExecutable(),
    [...COMPOSE_ARGS, ...args],
    createTestChildEnvironment(environment),
    action,
  );
  console.log("[test-db] " + action + " complete.");
}

async function resetDatabase(environment) {
  const target = validateTestDatabaseGuard(environment);
  const client = new Client({ connectionString: target.connectionString });
  let connected = false;
  let transactionStarted = false;

  try {
    await client.connect();
    connected = true;
    const identity = await client.query(
      "SELECT current_database() AS database",
    );
    if (
      identity.rowCount !== 1 ||
      identity.rows[0]?.database !== EXPECTED_DATABASE
    ) {
      throw new TestDatabaseCommandError(
        "Connected database identity did not match the dedicated test database.",
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }
    if (error instanceof TestDatabaseCommandError) {
      throw error;
    }
    throw new TestDatabaseCommandError(
      "Test database reset failed at " + target.sanitizedTarget + ".",
    );
  } finally {
    if (connected) {
      await client.end().catch(() => {});
    }
  }

  console.log(
    "[test-db] reset complete at " +
      target.sanitizedTarget +
      " (schema public).",
  );
}

async function runPrisma(environment, args, action) {
  const target = validateTestDatabaseGuard(environment);
  await runChild(
    process.execPath,
    [PRISMA_CLI, ...args],
    createTestChildEnvironment(environment),
    action,
  );
  console.log(
    "[test-db] " + action + " complete at " + target.sanitizedTarget + ".",
  );
}

function printGuard(environment) {
  const target = validateTestDatabaseGuard(environment);
  console.log("[test-db] guard ok: " + target.sanitizedTarget + ".");
}

async function main() {
  const action = process.argv[2];
  const environment = loadTestEnvironment();

  switch (action) {
    case "guard":
      printGuard(environment);
      return;
    case "up":
    case "wait":
      await runCompose(
        environment,
        ["up", "-d", "--wait", "db-test"],
        action === "wait" ? "wait" : "up/wait",
      );
      return;
    case "reset":
      await resetDatabase(environment);
      return;
    case "migrate":
      await runPrisma(environment, ["migrate", "deploy"], "migrate");
      return;
    case "seed":
      await runPrisma(environment, ["db", "seed"], "seed");
      return;
    case "prepare":
      printGuard(environment);
      await resetDatabase(environment);
      await runPrisma(environment, ["migrate", "deploy"], "migrate");
      await runPrisma(environment, ["db", "seed"], "seed");
      return;
    case "down":
      await runCompose(
        environment,
        ["down", "-v", "--remove-orphans"],
        "down/volume cleanup",
      );
      return;
    default:
      throw new TestDatabaseCommandError(
        "Usage: node scripts/test-db.mjs <guard|up|wait|reset|migrate|seed|prepare|down>",
      );
  }
}

function resolveInvokedPath(value) {
  if (!value) return "";
  try {
    return realpathSync(resolve(value));
  } catch {
    return "";
  }
}

const invokedPath = resolveInvokedPath(process.argv[1]);
if (invokedPath === TEST_DB_SCRIPT) {
  main().catch((error) => {
    if (
      error instanceof TestDatabaseGuardError ||
      error instanceof TestDatabaseCommandError
    ) {
      console.error("[test-db] " + error.message);
    } else {
      console.error("[test-db] Test database command failed.");
    }
    process.exitCode = 1;
  });
}
