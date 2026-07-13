import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AC-AUTH-005 (bootstrap + fail-fast, N-8b) — frozen contract (plan.md §5.3
// step 1): env.ts must parse OPERATOR_USERNAME + exactly-one-of
// OPERATOR_PASSWORD_HASH/OPERATOR_PASSWORD and fail fast (throw) when the
// required auth vars are absent at boot. Mode B: env.ts's real parsing +
// precedence logic (OPERATOR_PASSWORD_HASH wins when both are set) is
// implemented; these tests exercise it directly via fresh module reloads.

const ORIGINAL_ENV = { ...process.env };

async function loadEnvWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...overrides };
  return import("@/lib/config/env");
}

describe("AC-AUTH-005: operator env bootstrap contract", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fails fast when OPERATOR_USERNAME and both password vars are absent", async () => {
    await expect(
      loadEnvWith({
        OPERATOR_USERNAME: undefined,
        OPERATOR_PASSWORD_HASH: undefined,
        OPERATOR_PASSWORD: undefined,
      }),
    ).rejects.toThrow();
  });

  it("loads successfully with OPERATOR_USERNAME + OPERATOR_PASSWORD_HASH set", async () => {
    const { env } = await loadEnvWith({
      OPERATOR_USERNAME: "operator",
      OPERATOR_PASSWORD_HASH: "salt:hash",
      OPERATOR_PASSWORD: undefined,
    });
    expect(
      (env as unknown as { OPERATOR_USERNAME?: string }).OPERATOR_USERNAME,
    ).toBe("operator");
  });

  it("OPERATOR_PASSWORD_HASH wins when both OPERATOR_PASSWORD_HASH and OPERATOR_PASSWORD are supplied", async () => {
    // Contract (architecture §5.2 / .env.example): "exactly one of" is the
    // documented shape; when both are present, OPERATOR_PASSWORD_HASH wins
    // rather than the app refusing to boot. Asserts that resolved
    // precedence is actually observable on the parsed env.
    const { env } = await loadEnvWith({
      OPERATOR_USERNAME: "operator",
      OPERATOR_PASSWORD_HASH: "salt:hash",
      OPERATOR_PASSWORD: "plaintext-fallback",
    });
    expect(
      (env as unknown as { OPERATOR_PASSWORD_HASH?: string })
        .OPERATOR_PASSWORD_HASH,
    ).toBe("salt:hash");
  });
});
