import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  runCompose,
  validateTestDatabaseGuard,
  validateTestDatabaseTarget,
} from "../../../scripts/test-db.mjs";
import { loadTestEnvironment } from "../../../scripts/test-env.mjs";

const VALID_ENVIRONMENT = {
  NODE_ENV: "test" as const,
  ALLOW_TEST_DB_RESET: "1",
  TEST_DATABASE_MARKER: "inspoter-e2e",
  DATABASE_URL:
    "postgresql://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test?schema=public",
};

const REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const TEST_DB_SCRIPT = join(REPOSITORY_ROOT, "scripts", "test-db.mjs");
const TEMPORARY_DIRECTORIES: string[] = [];

function createTemporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

const FOREIGN_WORKING_DIRECTORY = createTemporaryDirectory(
  "inspoter-foreign-cwd-",
);

afterAll(() => {
  for (const directory of TEMPORARY_DIRECTORIES) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runGuardSubprocess(
  cwd: string,
  overrides: Record<string, string | undefined> = {},
) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    ALLOW_TEST_DB_RESET: "1",
    TEST_DATABASE_MARKER: "inspoter-e2e",
    ...overrides,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[key];
  }

  return spawnSync(process.execPath, [TEST_DB_SCRIPT, "guard"], {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 10_000,
  });
}

function environmentWith(overrides: Record<string, string | undefined>) {
  return { ...VALID_ENVIRONMENT, ...overrides };
}

function errorMessage(environment: Record<string, string | undefined>) {
  try {
    validateTestDatabaseGuard(environment);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected test database guard to reject the environment.");
}

describe("dedicated test database guard", () => {
  it("accepts the exact dedicated test database contract", () => {
    expect(validateTestDatabaseGuard(VALID_ENVIRONMENT)).toMatchObject({
      host: "127.0.0.1",
      port: "3833",
      database: "inspoter_e2e_test",
      schema: "public",
      sanitizedTarget: "127.0.0.1:3833/inspoter_e2e_test",
    });
  });

  it("separates safe target validation from destructive authorization", () => {
    const targetOnlyEnvironment = environmentWith({
      ALLOW_TEST_DB_RESET: undefined,
      TEST_DATABASE_MARKER: undefined,
    });

    expect(validateTestDatabaseTarget(targetOnlyEnvironment)).toMatchObject({
      database: "inspoter_e2e_test",
      port: "3833",
    });
    expect(() => validateTestDatabaseGuard(targetOnlyEnvironment)).toThrow(
      /ALLOW_TEST_DB_RESET must equal 1/,
    );
    expect(() =>
      validateTestDatabaseTarget({
        ...targetOnlyEnvironment,
        DATABASE_URL:
          "postgresql://test_user:test_password@127.0.0.1:3832/inspoter_e2e_test",
      }),
    ).toThrow(/port/);
  });

  it("accepts localhost, postgres: protocol, and an absent schema", () => {
    const result = validateTestDatabaseGuard(
      environmentWith({
        DATABASE_URL:
          "postgres://test_user:test_password@localhost:3833/inspoter_e2e_test",
      }),
    );
    expect(result.schema).toBe("public");
  });

  it.each([
    ["missing reset marker", { ALLOW_TEST_DB_RESET: undefined }],
    ["incorrect reset marker", { ALLOW_TEST_DB_RESET: "true" }],
    ["missing database marker", { TEST_DATABASE_MARKER: undefined }],
    ["incorrect database marker", { TEST_DATABASE_MARKER: "inspoter" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => validateTestDatabaseGuard(environmentWith(overrides))).toThrow(
      /Refusing test database operation/,
    );
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      validateTestDatabaseGuard(
        environmentWith({ DATABASE_URL: "not-a-database-url" }),
      ),
    ).toThrow(/valid PostgreSQL URL/);
  });

  it("rejects a non-PostgreSQL protocol", () => {
    expect(() =>
      validateTestDatabaseGuard(
        environmentWith({
          DATABASE_URL:
            "https://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test",
        }),
      ),
    ).toThrow(/protocol/);
  });

  it.each(["db-test", "10.0.0.8", "example.com"])(
    "rejects remote or compose host %s",
    (host) => {
      expect(() =>
        validateTestDatabaseGuard(
          environmentWith({
            DATABASE_URL:
              "postgresql://test_user:test_password@" +
              host +
              ":3833/inspoter_e2e_test",
          }),
        ),
      ).toThrow(/host/);
    },
  );

  it.each([
    ["missing", ""],
    ["developer port", ":3832"],
    ["PostgreSQL default", ":5432"],
  ])("rejects %s port", (_name, port) => {
    expect(() =>
      validateTestDatabaseGuard(
        environmentWith({
          DATABASE_URL:
            "postgresql://test_user:test_password@127.0.0.1" +
            port +
            "/inspoter_e2e_test",
        }),
      ),
    ).toThrow(/port/);
  });

  it.each([
    "inspot",
    "inspoter",
    "postgres",
    "template0",
    "template1",
    "another_test",
    "inspoter_e2e",
  ])("rejects wrong, production, or system database %s", (database) => {
    expect(() =>
      validateTestDatabaseGuard(
        environmentWith({
          DATABASE_URL:
            "postgresql://test_user:test_password@127.0.0.1:3833/" + database,
        }),
      ),
    ).toThrow(/database name/);
  });

  it.each(["private", "", "PUBLIC"])(
    "rejects non-public schema %s",
    (schema) => {
      expect(() =>
        validateTestDatabaseGuard(
          environmentWith({
            DATABASE_URL:
              "postgresql://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test?schema=" +
              schema,
          }),
        ),
      ).toThrow(/schema/);
    },
  );

  it("rejects extra query parameters that could alter connection behavior", () => {
    expect(() =>
      validateTestDatabaseGuard(
        environmentWith({
          DATABASE_URL:
            "postgresql://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test?schema=public&host=example.com",
        }),
      ),
    ).toThrow(/query/);
  });

  it("never echoes credentials or the full unsafe URL in guard errors", () => {
    const secret = "do-not-echo-this-secret";
    const unsafeUrl =
      "postgresql://sensitive_user:" +
      secret +
      "@db.internal:5432/inspot?schema=private";
    const message = errorMessage(environmentWith({ DATABASE_URL: unsafeUrl }));

    expect(message).not.toContain(secret);
    expect(message).not.toContain("sensitive_user");
    expect(message).not.toContain(unsafeUrl);
    expect(message).not.toContain("db.internal");
  });

  it("never loads destructive opt-ins from test environment files", () => {
    const repositoryRoot = createTemporaryDirectory("inspoter-test-env-");
    writeFileSync(
      join(repositoryRoot, ".env.test.example"),
      "ALLOW_TEST_DB_RESET=1\nTEST_DATABASE_MARKER=inspoter-e2e\nNODE_ENV=test\n",
    );
    writeFileSync(
      join(repositoryRoot, ".env.test.local"),
      "ALLOW_TEST_DB_RESET=1\nTEST_DATABASE_MARKER=inspoter-e2e\nLIST_PAGE_SIZE=25\n",
    );

    const environment = loadTestEnvironment({
      baseEnvironment: {
        NODE_ENV: "test",
        ALLOW_TEST_DB_RESET: undefined,
        TEST_DATABASE_MARKER: undefined,
      },
      repositoryRoot,
    });

    expect(environment.ALLOW_TEST_DB_RESET).toBeUndefined();
    expect(environment.TEST_DATABASE_MARKER).toBeUndefined();
    expect(environment.NODE_ENV).toBe("test");
    expect(environment.LIST_PAGE_SIZE).toBe("25");
  });

  it("accepts destructive opt-ins supplied explicitly by the caller", () => {
    const repositoryRoot = createTemporaryDirectory("inspoter-test-env-");
    writeFileSync(join(repositoryRoot, ".env.test.example"), "NODE_ENV=test\n");

    const environment = loadTestEnvironment({
      baseEnvironment: VALID_ENVIRONMENT,
      repositoryRoot,
    });

    expect(validateTestDatabaseGuard(environment)).toMatchObject({
      database: "inspoter_e2e_test",
      port: "3833",
    });
  });

  it("refuses a Compose down action before starting a child process", async () => {
    await expect(
      runCompose(
        environmentWith({ ALLOW_TEST_DB_RESET: undefined }),
        ["down", "-v", "--remove-orphans"],
        "down/volume cleanup",
      ),
    ).rejects.toThrow(/ALLOW_TEST_DB_RESET must equal 1/);
  });
  it.each([
    ["repository root", REPOSITORY_ROOT],
    ["nested directory", join(REPOSITORY_ROOT, "src")],
    ["foreign directory", FOREIGN_WORKING_DIRECTORY],
  ])("executes the guard from a $name cwd", (_name, cwd) => {
    const result = runGuardSubprocess(cwd, { DATABASE_URL: undefined });

    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout.trim()).toBe(
      "[test-db] guard ok: 127.0.0.1:3833/inspoter_e2e_test.",
    );
    expect(result.stderr).toBe("");
  });

  it.each([
    [
      "unsafe developer target",
      {
        DATABASE_URL:
          "postgresql://test_user:test_password@127.0.0.1:3832/inspoter_e2e_test?schema=public",
      },
    ],
    [
      "missing reset markers",
      {
        DATABASE_URL: VALID_ENVIRONMENT.DATABASE_URL,
        ALLOW_TEST_DB_RESET: undefined,
        TEST_DATABASE_MARKER: undefined,
      },
    ],
  ])("rejects $name from a foreign cwd", (_name, overrides) => {
    const result = runGuardSubprocess(FOREIGN_WORKING_DIRECTORY, overrides);

    expect(result.status).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Refusing test database operation");
    expect(result.stderr).not.toContain(String(overrides.DATABASE_URL));
  });
});
