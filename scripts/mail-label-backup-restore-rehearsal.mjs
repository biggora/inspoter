import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EVIDENCE_DIRECTORY,
  captureDatabaseSnapshot,
  compareAllSnapshotTables,
  guardedTestEnvironment,
  restoreDatabaseUrl,
  validateRestoreTarget,
  writeEvidence,
} from "./mail-label-phase5-evidence-lib.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const RESTORE_DATABASE = "inspoter_e2e_restore_test";
const BACKUP_MAGIC = "INSPOTER_PHASE5_BACKUP_V1";

function dockerExecutable() {
  return process.platform === "win32" ? "docker.exe" : "docker";
}

function runDocker(argumentsList, { input, binary = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      dockerExecutable(),
      [
        "compose",
        "-p",
        "inspoter-test",
        "-f",
        "docker-compose.test.yml",
        "exec",
        "-T",
        "db-test",
        ...argumentsList,
      ],
      {
        cwd: REPOSITORY_ROOT,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", () => {
      rejectPromise(new Error("Docker backup command could not start."));
    });
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        const outcome =
          signal === null ? `exit code ${code}` : `signal ${signal}`;
        rejectPromise(
          new Error(
            `Docker backup command failed (${outcome}): ${Buffer.concat(
              stderr,
            ).toString("utf8")}`,
          ),
        );
        return;
      }
      const output = Buffer.concat(stdout);
      resolvePromise(binary ? output : output.toString("utf8"));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function encryptionKey() {
  const value = process.env.MAIL_LABEL_BACKUP_KEY;
  if (!/^[a-fA-F0-9]{64}$/.test(value ?? "")) {
    throw new Error(
      "MAIL_LABEL_BACKUP_KEY must be exactly 64 hexadecimal characters.",
    );
  }
  return Buffer.from(value, "hex");
}

function requiredMetadata(name) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for retained backup evidence.`);
  return value;
}

function encryptDump(dump, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(dump), cipher.final()]);
  const header = {
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
  return Buffer.concat([
    Buffer.from(`${BACKUP_MAGIC}\n${JSON.stringify(header)}\n`, "utf8"),
    ciphertext,
  ]);
}

function decryptDump(encrypted, key) {
  const firstBreak = encrypted.indexOf(0x0a);
  const secondBreak = encrypted.indexOf(0x0a, firstBreak + 1);
  if (
    firstBreak < 0 ||
    secondBreak < 0 ||
    encrypted.subarray(0, firstBreak).toString("utf8") !== BACKUP_MAGIC
  ) {
    throw new Error("Encrypted backup header is invalid.");
  }
  const header = JSON.parse(
    encrypted.subarray(firstBreak + 1, secondBreak).toString("utf8"),
  );
  if (header.algorithm !== "AES-256-GCM") {
    throw new Error("Encrypted backup algorithm is unsupported.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(header.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(header.authTag, "base64"));
  return Buffer.concat([
    decipher.update(encrypted.subarray(secondBreak + 1)),
    decipher.final(),
  ]);
}

async function dropRestoreDatabase() {
  await runDocker([
    "psql",
    "-U",
    "inspoter_test",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${RESTORE_DATABASE} WITH (FORCE)`,
  ]);
}

async function main() {
  const { environment, target } = guardedTestEnvironment();
  const restoreUrl = restoreDatabaseUrl(environment.DATABASE_URL);
  validateRestoreTarget(environment.DATABASE_URL, restoreUrl);
  const key = encryptionKey();
  const owner = requiredMetadata("MAIL_LABEL_BACKUP_OWNER");
  const retention = requiredMetadata("MAIL_LABEL_BACKUP_RETENTION");

  const sourceSnapshot = await captureDatabaseSnapshot(
    environment.DATABASE_URL,
  );
  const dump = await runDocker(
    [
      "pg_dump",
      "-U",
      "inspoter_test",
      "-d",
      target.database,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
    ],
    { binary: true },
  );
  if (!dump.subarray(0, 5).equals(Buffer.from("PGDMP"))) {
    throw new Error(
      "pg_dump did not return a PostgreSQL custom-format archive.",
    );
  }
  const encrypted = encryptDump(dump, key);
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const backupPath = resolve(EVIDENCE_DIRECTORY, "mail-label-phase5.dump.enc");
  await writeFile(backupPath, encrypted);
  const persistedEncrypted = await readFile(backupPath);
  const restoredDump = decryptDump(persistedEncrypted, key);
  if (!restoredDump.equals(dump)) {
    throw new Error("Encrypted backup did not decrypt byte-for-byte.");
  }

  let restoreSnapshot;
  let differences;
  await dropRestoreDatabase();
  try {
    await runDocker([
      "psql",
      "-U",
      "inspoter_test",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE DATABASE ${RESTORE_DATABASE}`,
    ]);
    await runDocker(
      [
        "pg_restore",
        "-U",
        "inspoter_test",
        "-d",
        RESTORE_DATABASE,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
      ],
      { input: restoredDump },
    );
    restoreSnapshot = await captureDatabaseSnapshot(restoreUrl);
    differences = compareAllSnapshotTables(sourceSnapshot, restoreSnapshot);
    if (differences.length > 0) {
      throw new Error(
        `Restored Mail data differs from source:\n${differences.join("\n")}`,
      );
    }
  } finally {
    await dropRestoreDatabase();
  }

  const encryptedSha256 = createHash("sha256")
    .update(persistedEncrypted)
    .digest("hex");
  const evidence = {
    status: "PASS",
    createdAt: new Date().toISOString(),
    source: target.sanitizedTarget,
    restoreTarget: `127.0.0.1:3833/${RESTORE_DATABASE}`,
    owner,
    retention,
    access:
      "local Phase 5 verifier; key supplied out-of-band and never retained",
    encryption: "AES-256-GCM",
    encryptedBytes: persistedEncrypted.length,
    encryptedSha256,
    sourceSnapshot,
    restoreSnapshot,
    differences,
    restoreDatabaseRemoved: true,
  };
  const evidencePath = await writeEvidence("backup-restore.json", evidence);
  console.log(
    `[mail-label-phase5] encrypted backup/restore passed; evidence ${evidencePath}.`,
  );
}

main().catch((error) => {
  console.error(`[mail-label-phase5] ${error.message}`);
  process.exitCode = 1;
});
