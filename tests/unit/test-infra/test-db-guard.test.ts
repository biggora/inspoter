import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runCompose,
  validateTestDatabaseGuard,
} from "../../../scripts/test-db.mjs";
import { loadTestEnvironment } from "../../../scripts/test-env.mjs";

const VALID_ENVIRONMENT = {
  NODE_ENV: "test" as const,
  ALLOW_TEST_DB_RESET: "1",
  TEST_DATABASE_MARKER: "inspoter-e2e",
  DATABASE_URL:
    "postgresql://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test?schema=public",
};

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
    const repositoryRoot = mkdtempSync(join(tmpdir(), "inspoter-test-env-"));
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
    const repositoryRoot = mkdtempSync(join(tmpdir(), "inspoter-test-env-"));
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
});
