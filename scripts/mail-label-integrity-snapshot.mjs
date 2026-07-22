import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  EVIDENCE_DIRECTORY,
  captureDatabaseSnapshot,
  compareAllSnapshotTables,
  guardedTestEnvironment,
  writeEvidence,
} from "./mail-label-phase5-evidence-lib.mjs";

function safeEvidenceName(value) {
  if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(value ?? "")) {
    throw new Error("Evidence filename must match [a-z0-9-]+.json.");
  }
  return value;
}

async function main() {
  const command = process.argv[2];
  if (command === "capture") {
    const name = safeEvidenceName(process.argv[3]);
    const { environment, target } = guardedTestEnvironment();
    const snapshot = await captureDatabaseSnapshot(environment.DATABASE_URL);
    const path = await writeEvidence(name, {
      target: target.sanitizedTarget,
      snapshot,
    });
    console.log(`[mail-label-phase5] captured ${basename(path)}.`);
    return;
  }

  if (command === "compare") {
    const beforeName = safeEvidenceName(process.argv[3]);
    const afterName = safeEvidenceName(process.argv[4]);
    const before = JSON.parse(
      await readFile(resolve(EVIDENCE_DIRECTORY, beforeName), "utf8"),
    );
    const after = JSON.parse(
      await readFile(resolve(EVIDENCE_DIRECTORY, afterName), "utf8"),
    );
    const differences = compareAllSnapshotTables(
      before.snapshot,
      after.snapshot,
    );
    if (differences.length > 0) {
      throw new Error(`Integrity mismatch:\n${differences.join("\n")}`);
    }
    console.log("[mail-label-phase5] integrity snapshots match.");
    return;
  }

  throw new Error(
    "Usage: node scripts/mail-label-integrity-snapshot.mjs " +
      "<capture NAME.json|compare BEFORE.json AFTER.json>",
  );
}

main().catch((error) => {
  console.error(`[mail-label-phase5] ${error.message}`);
  process.exitCode = 1;
});
