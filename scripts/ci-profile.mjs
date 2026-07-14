import { spawn } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  createTestChildEnvironment,
  loadTestEnvironment,
} from "./test-env.mjs";
import { validateTestDatabaseGuard } from "./test-db.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const CI_PROFILE_SCRIPT = realpathSync(
  resolve(REPOSITORY_ROOT, "scripts", "ci-profile.mjs"),
);
const PNPM_VERSION = "11.12.0";
const CLEANUP_STEP = "test:db:down";
const PNPM_VERSION_TIMEOUT_MS = 2_000;
const PNPM_VERSION_OUTPUT_LIMIT = 64;
const PROCESS_TREE_TERMINATION_TIMEOUT_MS = 1_000;
const PNPM_VERSION_ENVIRONMENT_KEYS = [
  "PATH",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "TEMP",
const UNTRUSTED_RUNTIME_ENVIRONMENT_KEYS = [
  "npm_execpath",
  "npm_config_user_agent",
  "COREPACK_HOME",
  "COREPACK_DEFAULT_TO_LATEST",
  "COREPACK_ENABLE_PROJECT_SPEC",
  "COREPACK_ENABLE_STRICT",
  "COREPACK_INTEGRITY_KEYS",
  "COREPACK_NPM_REGISTRY",
  "XDG_CACHE_HOME",
  "LOCALAPPDATA",
  "APPDATA",
  "HOME",
  "USERPROFILE",
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
];
  "TMP",
];

export const PROFILE_STEPS = Object.freeze({
  full: Object.freeze([
    "lint",
    "typecheck",
    "test:db:up",
    "test:db:guard",
    "test:db:prepare",
    "test:unit",
    "build",
    "test:db:prepare",
    "test:e2e:raw",
  ]),
  e2e: Object.freeze([
    "test:db:up",
    "test:db:guard",
    "test:db:prepare",
    "build",
    "test:db:prepare",
    "test:e2e:raw",
  ]),
});

export class CiProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = "CiProfileError";
  }
}

function usageError() {
  return new CiProfileError(
    "Usage: pnpm run <test:ci|test:e2e> (profiles: full or e2e).",
  );
}

function corepackPnpmBinEntry(packageManifest) {
  if (
    packageManifest === null ||
    typeof packageManifest !== "object" ||
    packageManifest.bin === null ||
    typeof packageManifest.bin !== "object" ||
    typeof packageManifest.bin.pnpm !== "string"
  ) {
    return "";
  }
  return packageManifest.bin.pnpm;
}

function isPathInside(parentPath, candidatePath) {
  const relativePath = relative(parentPath, candidatePath);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(".." + sep) &&
    !isAbsolute(relativePath)
  );
}

function runtimeCorepackDirectories(runtimeExecutable) {
  const runtimeDirectory = dirname(runtimeExecutable);
  if (process.platform === "win32") {
    return [resolve(runtimeDirectory, "node_modules", "corepack")];
  }

  const runtimePrefix = dirname(runtimeDirectory);
  return [
    resolve(runtimePrefix, "lib", "node_modules", "corepack"),
    resolve(runtimeDirectory, "node_modules", "corepack"),
  ];
}

function trustedPnpmLauncherAt(corepackDirectory, runtimePrefix) {
  try {
    const canonicalCorepackDirectory = realpathSync(corepackDirectory);
    if (!isPathInside(runtimePrefix, canonicalCorepackDirectory)) {
      return undefined;
    }

    const manifestPath = resolve(canonicalCorepackDirectory, "package.json");
    if (!statSync(manifestPath).isFile()) return undefined;
    const packageManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (packageManifest?.name !== "corepack") return undefined;

    const binEntry = corepackPnpmBinEntry(packageManifest);
    if (binEntry.length === 0) return undefined;

    const launcher = realpathSync(resolve(canonicalCorepackDirectory, binEntry));
    if (
      !statSync(launcher).isFile() ||
      !isPathInside(canonicalCorepackDirectory, launcher)
    ) {
      return undefined;
    }
    return launcher;
  } catch {
    return undefined;
  }
}

function resolveTrustedPnpmLauncher() {
  let runtimeExecutable;
  try {
    runtimeExecutable = realpathSync(process.execPath);
    if (!statSync(runtimeExecutable).isFile()) throw usageError();
  } catch {
    throw usageError();
  }

  const runtimeDirectory = dirname(runtimeExecutable);
  const runtimePrefix =
    process.platform === "win32" ? runtimeDirectory : dirname(runtimeDirectory);

  for (const corepackDirectory of runtimeCorepackDirectories(
    runtimeExecutable,
  )) {
    const launcher = trustedPnpmLauncherAt(corepackDirectory, runtimePrefix);
    if (launcher !== undefined) return launcher;
  }

  throw usageError();
}

function validatePnpmLifecycle(environment) {
  const userAgent = environment.npm_config_user_agent;
  if (
    typeof userAgent !== "string" ||
    !userAgent.startsWith("pnpm/" + PNPM_VERSION + " ")
  ) {
    throw usageError();
  }
}

function trustedCorepackEnvironment(environment, nodeEnvironment) {
  const childEnvironment = createTestChildEnvironment(environment);
  const blockedKeys = new Set(
    UNTRUSTED_RUNTIME_ENVIRONMENT_KEYS.map((key) => key.toLowerCase()),
  );

  for (const key of Object.keys(childEnvironment)) {
    if (blockedKeys.has(key.toLowerCase())) delete childEnvironment[key];
  }

  childEnvironment.NODE_ENV = nodeEnvironment;
  childEnvironment.NO_COLOR = "1";
  childEnvironment.COREPACK_ENABLE_NETWORK = "0";
  childEnvironment.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
  return childEnvironment;
}

function stepEnvironment(environment, step) {
  return trustedCorepackEnvironment(
    environment,
    step === "build" ? "production" : "test",
  );
}

function pnpmVersionEnvironment(environment) {
  const childEnvironment = {};
  const allowedKeys = new Set(
    PNPM_VERSION_ENVIRONMENT_KEYS.map((key) => key.toLowerCase()),
  );

  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === "string" && allowedKeys.has(key.toLowerCase())) {
      childEnvironment[key] = value;
    }
  }

  return trustedCorepackEnvironment(childEnvironment, "test");
}

function environmentValue(environment, expectedKey) {
  const normalizedExpectedKey = expectedKey.toLowerCase();
  for (const [key, value] of Object.entries(environment)) {
    if (key.toLowerCase() === normalizedExpectedKey && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function resolveWindowsTaskkill() {
  try {
    const systemRootValue =
      environmentValue(process.env, "SystemRoot") ??
      environmentValue(process.env, "WINDIR");
    if (systemRootValue === undefined || !isAbsolute(systemRootValue)) {
      return undefined;
    }

    const systemRoot = realpathSync(systemRootValue);
    const executable = realpathSync(
      resolve(systemRoot, "System32", "taskkill.exe"),
    );
    if (
      !statSync(executable).isFile() ||
      basename(executable).toLowerCase() !== "taskkill.exe" ||
      !isPathInside(systemRoot, executable)
    ) {
      return undefined;
    }
    return { executable, systemRoot };
  } catch {
    return undefined;
  }
}

function safeKillDirectChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // The child can exit between the status check and the signal.
  }
}

async function terminateWindowsProcessTree(pid) {
  const taskkill = resolveWindowsTaskkill();
  if (taskkill === undefined) return;

  await new Promise((resolvePromise) => {
    let settled = false;
    let deadline;
    const killer = spawn(
      taskkill.executable,
      ["/PID", String(pid), "/T", "/F"],
      {
        env: {
          SystemRoot: taskkill.systemRoot,
          WINDIR: taskkill.systemRoot,
        },
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      },
    );

    const finish = () => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      killer.removeListener("error", finish);
      killer.removeListener("close", finish);
      resolvePromise();
    };

    killer.once("error", finish);
    killer.once("close", finish);
    deadline = setTimeout(() => {
      try {
        killer.kill("SIGKILL");
      } catch {
        // The taskkill process can exit before the timeout callback runs.
      }
      finish();
    }, PROCESS_TREE_TERMINATION_TIMEOUT_MS);
  });
}

function posixProcessGroupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function terminatePosixProcessTree(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }

  const deadline = Date.now() + PROCESS_TREE_TERMINATION_TIMEOUT_MS;
  while (posixProcessGroupIsAlive(pid) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

async function terminateProcessTree(child) {
  const pid = child.pid;
  if (Number.isInteger(pid) && pid > 0) {
    if (process.platform === "win32") {
      await terminateWindowsProcessTree(pid);
    } else {
      await terminatePosixProcessTree(pid);
    }
  }
  safeKillDirectChild(child);
}

async function probePnpmVersionWithLauncher(pnpmLauncher, environment) {
  await new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let settled = false;
    let deadline;
    const child = spawn(process.execPath, [pnpmLauncher, "--version"], {
      cwd: REPOSITORY_ROOT,
      detached: process.platform !== "win32",
      env: pnpmVersionEnvironment(environment),
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });

    const cleanup = () => {
      if (deadline !== undefined) clearTimeout(deadline);
      child.stdout.removeListener("data", onStdout);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      child.stdout.destroy();
    };

    const rejectProbe = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      await terminateProcessTree(child);
      rejectPromise(usageError());
    };

    const onStdout = (chunk) => {
      if (settled) return;
      const remaining = PNPM_VERSION_OUTPUT_LIMIT - stdout.length;
      if (chunk.length > remaining) {
        void rejectProbe();
        return;
      }
      stdout += chunk;
    };

    const onError = () => {
      void rejectProbe();
    };
    const onClose = (code, signal) => {
      if (settled) return;
      if (code === 0 && signal === null && stdout.trim() === PNPM_VERSION) {
        settled = true;
        cleanup();
        resolvePromise();
        return;
      }
      void rejectProbe();
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", onStdout);
    child.once("error", onError);
    child.once("close", onClose);
    if (!settled) {
      deadline = setTimeout(
        () => void rejectProbe(),
        PNPM_VERSION_TIMEOUT_MS,
      );
    }
  });
}

async function probeTrustedPnpmVersion(pnpmLauncher, environment) {
  await probePnpmVersionWithLauncher(pnpmLauncher, environment);
}

export async function probePnpmVersionForTest(pnpmLauncher, environment) {
  await probePnpmVersionWithLauncher(pnpmLauncher, environment);
}

async function runPnpmStep(pnpmCli, step, environment) {
  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const child = spawn(process.execPath, [pnpmCli, "run", step], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", () => {
      if (settled) return;
      settled = true;
      rejectPromise(new CiProfileError("CI profile step could not start."));
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolvePromise();
        return;
      }
      const outcome =
        signal === null ? "exit code " + String(code) : "signal " + signal;
      rejectPromise(
        new CiProfileError(
          "CI profile step " + step + " failed (" + outcome + ").",
        ),
      );
    });
  });
}

export async function executeCiProfile({
  profile,
  runStep,
  environment = process.env,
}) {
  if (profile !== "full" && profile !== "e2e") {
    throw usageError();
  }
  const steps = PROFILE_STEPS[profile];

  validatePnpmLifecycle(environment);
  const pnpmLauncher = resolveTrustedPnpmLauncher();
  await probeTrustedPnpmVersion(pnpmLauncher, environment);
  validateTestDatabaseGuard(environment);

  const executeStep =
    runStep ??
    ((step, childEnvironment) => runPnpmStep(pnpmLauncher, step, childEnvironment));

  let cleanupArmed = false;
  let primaryError;
  try {
    for (const step of steps) {
      if (step === "test:db:up") {
        cleanupArmed = true;
      }
      await executeStep(step, stepEnvironment(environment, step));
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (cleanupArmed) {
      try {
        await executeStep(
          CLEANUP_STEP,
          stepEnvironment(environment, CLEANUP_STEP),
        );
      } catch (cleanupError) {
        if (primaryError === undefined) {
          primaryError = cleanupError;
        }
      }
    }
  }

  if (primaryError !== undefined) {
    throw primaryError;
  }
}

async function main() {
  await executeCiProfile({
    profile: process.argv[2],
    environment: loadTestEnvironment(),
  });
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
if (invokedPath === CI_PROFILE_SCRIPT) {
  main().catch((error) => {
    if (error instanceof CiProfileError) {
      console.error("[ci-profile] " + error.message);
    } else {
      console.error("[ci-profile] CI profile failed.");
    }
    process.exitCode = 1;
  });
}
