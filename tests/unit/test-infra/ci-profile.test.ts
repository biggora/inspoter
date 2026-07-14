import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  executeCiProfile,
  probePnpmVersionForTest,
  PROFILE_STEPS,
} from "../../../scripts/ci-profile.mjs";

const PROVIDER_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "HETZNER_DNS_TOKEN",
  "GODADDY_API_KEY",
  "GODADDY_API_SECRET",
  "HCLOUD_TOKEN",
] as const;

const REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CI_PROFILE_SCRIPT = join(REPOSITORY_ROOT, "scripts", "ci-profile.mjs");
const SAFE_DATABASE_URL =
  "postgresql://test_user:test_password@127.0.0.1:3833/inspoter_e2e_test?schema=public";
const TEMPORARY_DIRECTORIES: string[] = [];
const CHILD_PIDS = new Set<number>();

function createTemporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function forceKill(pid: number) {
  if (!processIsAlive(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process can exit between the liveness check and the kill request.
  }
}

async function waitForProcessExit(pid: number) {
  const deadline = Date.now() + 1_500;
  while (processIsAlive(pid) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  return !processIsAlive(pid);
}

function readPid(pidPath: string) {
  if (!existsSync(pidPath)) return undefined;
  const pid = Number.parseInt(readFileSync(pidPath, "utf8"), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function readProcessTree(pidPath: string) {
  if (!existsSync(pidPath)) return [];
  const value: unknown = JSON.parse(readFileSync(pidPath, "utf8"));
  if (!Array.isArray(value)) return [];
  const pids = value.filter(
    (item): item is number => Number.isInteger(item) && item > 0,
  );
  return pids.length === value.length ? pids : [];
}

function validLifecycleEnvironment(): NodeJS.ProcessEnv {
  return environmentWithExactKeys({
    npm_execpath: "ignored-by-ci-profile-tests",
    npm_config_user_agent: "pnpm/11.12.0 npm/? node/test test",
    ALLOW_TEST_DB_RESET: "1",
    TEST_DATABASE_MARKER: "inspoter-e2e",
    DATABASE_URL: SAFE_DATABASE_URL,
  });
}

function environmentWithExactKeys(
  overrides: Record<string, string>,
): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  const replacedKeys = new Set(
    Object.keys(overrides).map((key) => key.toLowerCase()),
  );
  for (const key of Object.keys(environment)) {
    if (replacedKeys.has(key.toLowerCase())) delete environment[key];
  }
  return { ...environment, ...overrides };
}

function probeScript(directory: string, body: string) {
  const candidate = join(directory, "pnpm.mjs");
  writeFileSync(candidate, body);
  return candidate;
}

afterAll(() => {
  for (const pid of CHILD_PIDS) forceKill(pid);
  for (const directory of TEMPORARY_DIRECTORIES) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("deterministic CI profile runner", () => {
  it("attests the real lifecycle pnpm, executes the full profile, and cleans once", async () => {
    const calls: string[] = [];

    await executeCiProfile({
      profile: "full",
      environment: validLifecycleEnvironment(),
      runStep: async (step: string) => {
        calls.push(step);
      },
    });

    expect(calls).toEqual([...PROFILE_STEPS.full, "test:db:down"]);
  });

  it("executes the exact e2e profile and one cleanup", async () => {
    const calls: string[] = [];

    await executeCiProfile({
      profile: "e2e",
      environment: validLifecycleEnvironment(),
      runStep: async (step: string) => {
        calls.push(step);
      },
    });

    expect(calls).toEqual([...PROFILE_STEPS.e2e, "test:db:down"]);
  });

  it("preserves a mid-profile error and attempts cleanup exactly once", async () => {
    const calls: string[] = [];
    const primaryError = new Error("primary failure");
    const cleanupError = new Error("cleanup failure");
    let capturedError: unknown;

    try {
      await executeCiProfile({
        profile: "full",
        environment: validLifecycleEnvironment(),
        runStep: async (step: string) => {
          calls.push(step);
          if (step === "test:unit") throw primaryError;
          if (step === "test:db:down") throw cleanupError;
        },
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBe(primaryError);
    expect(calls.filter((step) => step === "test:db:down")).toHaveLength(1);
  });

  it("blanks providers and assigns production only to build children", async () => {
    const children: Array<{
      step: string;
      environment: NodeJS.ProcessEnv;
    }> = [];

    await executeCiProfile({
      profile: "full",
      environment: {
        ...validLifecycleEnvironment(),
        CLOUDFLARE_API_TOKEN: "real-cloudflare",
        HETZNER_DNS_TOKEN: "real-hetzner-dns",
        GODADDY_API_KEY: "real-godaddy-key",
        GODADDY_API_SECRET: "real-godaddy-secret",
        HCLOUD_TOKEN: "real-hcloud",
      },
      runStep: async (step: string, environment: NodeJS.ProcessEnv) => {
        children.push({ step, environment });
      },
    });

    for (const child of children) {
      for (const key of PROVIDER_KEYS) {
        expect(child.environment[key]).toBe("");
      }
      expect(child.environment.NODE_ENV).toBe(
        child.step === "build" ? "production" : "test",
      );
    }
  });

  it("ignores an exact-shape self-authored Corepack spoof", () => {
    const temporaryDirectory = createTemporaryDirectory(
      "inspoter-pnpm-ownership-",
    );
    const ownerDirectory = join(
      temporaryDirectory,
      "corepack",
      "v1",
      "pnpm",
      "11.12.0",
    );
    mkdirSync(ownerDirectory, { recursive: true });
    writeFileSync(
      join(ownerDirectory, "package.json"),
      JSON.stringify({
        name: "pnpm",
        version: "11.12.0",
        bin: "pnpm.mjs",
      }),
    );

    const fakePnpmCli = join(ownerDirectory, "pnpm.mjs");
    const probeSentinel = join(temporaryDirectory, "probe-reached");
    const runSentinel = join(temporaryDirectory, "run-reached");
    writeFileSync(
      fakePnpmCli,
      [
        'import { writeFileSync } from "node:fs";',
        'if (process.argv[2] === "--version") {',
        `  writeFileSync(${JSON.stringify(probeSentinel)}, "reached");`,
        '  process.stdout.write("11.12.0\\n");',
        '} else if (process.argv[2] === "run") {',
        `  writeFileSync(${JSON.stringify(runSentinel)}, "reached");`,
        "}",
      ].join("\n"),
    );

    const result = spawnSync(process.execPath, [CI_PROFILE_SCRIPT, "full"], {
      cwd: REPOSITORY_ROOT,
      env: environmentWithExactKeys({
        npm_execpath: fakePnpmCli,
        npm_config_user_agent: "pnpm/11.12.0 npm/? node/test test",
        ALLOW_TEST_DB_RESET: "0",
        TEST_DATABASE_MARKER: "inspoter-e2e",
        DATABASE_URL: SAFE_DATABASE_URL,
      }),
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.status, result.stderr).toBe(1);
    expect(result.signal).toBeNull();
    expect(existsSync(probeSentinel)).toBe(false);
    expect(existsSync(runSentinel)).toBe(false);
    expect(result.stderr).toBe("[ci-profile] CI profile failed.\n");
    expect(result.stderr).not.toContain(temporaryDirectory);
    expect(result.stderr).not.toContain(SAFE_DATABASE_URL);
  });

  it("force-kills a version probe that ignores SIGTERM", async () => {
    const temporaryDirectory = createTemporaryDirectory(
      "inspoter-pnpm-timeout-",
    );
    const pidPath = join(temporaryDirectory, "child.pid");
    const sentinel = join(temporaryDirectory, "run-reached");
    const candidate = probeScript(
      temporaryDirectory,
      [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
        'process.on("SIGTERM", () => {});',
        `if (process.argv[2] === "run") writeFileSync(${JSON.stringify(sentinel)}, "reached");`,
        "setInterval(() => {}, 1_000);",
      ].join("\n"),
    );
    const startedAt = Date.now();
    let probeError: unknown;
    let pid: number | undefined;

    try {
      await probePnpmVersionForTest(candidate, validLifecycleEnvironment());
    } catch (error) {
      probeError = error;
    } finally {
      pid = readPid(pidPath);
      if (pid !== undefined) CHILD_PIDS.add(pid);
    }

    expect(probeError).toBeInstanceOf(Error);
    expect(String(probeError)).toContain("Usage:");
    expect(String(probeError)).not.toContain(candidate);
    expect(Date.now() - startedAt).toBeLessThan(3_500);
    expect(pid).toBeDefined();
    expect(existsSync(sentinel)).toBe(false);
    expect(await waitForProcessExit(pid!)).toBe(true);
    CHILD_PIDS.delete(pid!);
  });

  it("bounds output and force-kills a flooding version probe promptly", async () => {
    const temporaryDirectory = createTemporaryDirectory("inspoter-pnpm-flood-");
    const pidPath = join(temporaryDirectory, "child.pid");
    const sentinel = join(temporaryDirectory, "run-reached");
    const candidate = probeScript(
      temporaryDirectory,
      [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
        `if (process.argv[2] === "run") writeFileSync(${JSON.stringify(sentinel)}, "reached");`,
        'process.stdout.write("x".repeat(4_096));',
        "setInterval(() => {}, 1_000);",
      ].join("\n"),
    );
    const startedAt = Date.now();
    let probeError: unknown;
    let pid: number | undefined;

    try {
      await probePnpmVersionForTest(candidate, validLifecycleEnvironment());
    } catch (error) {
      probeError = error;
    } finally {
      pid = readPid(pidPath);
      if (pid !== undefined) CHILD_PIDS.add(pid);
    }

    expect(probeError).toBeInstanceOf(Error);
    expect(String(probeError)).toContain("Usage:");
    expect(String(probeError)).not.toContain(candidate);
    expect(Date.now() - startedAt).toBeLessThan(1_800);
    expect(pid).toBeDefined();
    expect(existsSync(sentinel)).toBe(false);
    expect(await waitForProcessExit(pid!)).toBe(true);
    CHILD_PIDS.delete(pid!);
  });
  it("kills timeout probe descendants, not only the direct child", async () => {
    const temporaryDirectory = createTemporaryDirectory(
      "inspoter-pnpm-timeout-tree-",
    );
    const pidPath = join(temporaryDirectory, "tree.json");
    const sentinel = join(temporaryDirectory, "run-reached");
    const grandchildCode =
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1_000);';
    const candidate = probeScript(
      temporaryDirectory,
      [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        `const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(grandchildCode)}], { stdio: "ignore" });`,
        `writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify([process.pid, grandchild.pid]));`,
        'process.on("SIGTERM", () => {});',
        `if (process.argv[2] === "run") writeFileSync(${JSON.stringify(sentinel)}, "reached");`,
        "setInterval(() => {}, 1_000);",
      ].join("\n"),
    );

    await expect(
      probePnpmVersionForTest(candidate, validLifecycleEnvironment()),
    ).rejects.toThrow(/Usage:/);

    const pids = readProcessTree(pidPath);
    for (const pid of pids) CHILD_PIDS.add(pid);
    expect(pids).toHaveLength(2);
    expect(existsSync(sentinel)).toBe(false);
    expect(await Promise.all(pids.map(waitForProcessExit))).toEqual([
      true,
      true,
    ]);
    for (const pid of pids) CHILD_PIDS.delete(pid);
  });

  it("kills flooding probe descendants while keeping output bounded", async () => {
    const temporaryDirectory = createTemporaryDirectory(
      "inspoter-pnpm-flood-tree-",
    );
    const pidPath = join(temporaryDirectory, "tree.json");
    const sentinel = join(temporaryDirectory, "run-reached");
    const grandchildCode =
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1_000);';
    const candidate = probeScript(
      temporaryDirectory,
      [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        `const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(grandchildCode)}], { stdio: "ignore" });`,
        `writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify([process.pid, grandchild.pid]));`,
        `if (process.argv[2] === "run") writeFileSync(${JSON.stringify(sentinel)}, "reached");`,
        'process.stdout.write("x".repeat(4_096));',
        "setInterval(() => {}, 1_000);",
      ].join("\n"),
    );
    const startedAt = Date.now();

    await expect(
      probePnpmVersionForTest(candidate, validLifecycleEnvironment()),
    ).rejects.toThrow(/Usage:/);

    const pids = readProcessTree(pidPath);
    for (const pid of pids) CHILD_PIDS.add(pid);
    expect(Date.now() - startedAt).toBeLessThan(1_800);
    expect(pids).toHaveLength(2);
    expect(existsSync(sentinel)).toBe(false);
    expect(await Promise.all(pids.map(waitForProcessExit))).toEqual([
      true,
      true,
    ]);
    for (const pid of pids) CHILD_PIDS.delete(pid);
  });
});
