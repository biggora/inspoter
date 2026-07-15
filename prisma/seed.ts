import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

// Idempotent first-boot operator bootstrap (architecture.md §5.2, plan.md
// §5.3 Step 3; AC-AUTH-005, N-8b). Invoked via `npm run db:seed`
// (-> `prisma db seed`, wired through prisma.config.ts `migrations.seed`).
//
// This script talks to Postgres directly via the `pg` driver instead of
// importing the generated Prisma client or the rest of `src/lib/**`: those
// modules use the project's `@/*` path alias and extensionless relative
// imports (including inside the Prisma-generated client itself), which only
// resolve under Next.js's/Vitest's bundler-aware module resolution — not
// under a bare `node prisma/seed.ts` invocation (no bundler in the loop, and
// adding a TS-execution devDependency like tsx/ts-node is outside this
// task's scope; package.json is implementor-owned). Keeping this script
// dependency-light (pg + node:crypto only) sidesteps that entirely.
//
// The scrypt hash format ("<hex-salt>:<hex-derived-key>") mirrors
// src/lib/auth/password.ts's hashPassword() exactly — keep both in sync if
// the algorithm/parameters ever change.

const KEY_LENGTH = 64;
const scryptAsync = promisify(scryptCallback);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  const username = process.env.OPERATOR_USERNAME;
  const passwordHashEnv = process.env.OPERATOR_PASSWORD_HASH;
  const passwordEnv = process.env.OPERATOR_PASSWORD;

  if (!username || !(passwordHashEnv || passwordEnv)) {
    throw new Error(
      "Seed aborted: OPERATOR_USERNAME and exactly one of " +
        "OPERATOR_PASSWORD_HASH/OPERATOR_PASSWORD must be set (AC-AUTH-005).",
    );
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const existing = await client.query('SELECT id FROM "Operator" LIMIT 1');
    if (existing.rowCount && existing.rowCount > 0) {
      const operatorId = existing.rows[0].id;
      const wsExisting = await client.query(
        'SELECT id FROM "Workspace" LIMIT 1',
      );
      if (!wsExisting.rowCount || wsExisting.rowCount === 0) {
        // Create workspace for existing operator
        const workspaceId = randomUUID();
        const opRow = await client.query(
          'SELECT username FROM "Operator" WHERE id = $1',
          [operatorId],
        );
        const slug = opRow.rows[0].username
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-");
        await client.query(
          'INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
          [workspaceId, `${opRow.rows[0].username}'s workspace`, slug],
        );
        const membershipId = randomUUID();
        await client.query(
          'INSERT INTO "WorkspaceMember" (id, "workspaceId", "operatorId", role, "joinedAt") VALUES ($1, $2, $3, $4, now())',
          [membershipId, workspaceId, operatorId, "OWNER"],
        );
        console.log(`Seed: created default workspace for existing operator.`);
      } else {
        console.log("Seed: an Operator already exists — no-op.");
      }
      return;
    }

    // OPERATOR_PASSWORD_HASH wins when both are present (architecture §5.2).
    let passwordHash: string;
    if (passwordHashEnv) {
      if (passwordEnv) {
        console.warn(
          "Both OPERATOR_PASSWORD_HASH and OPERATOR_PASSWORD are set — " +
            "using OPERATOR_PASSWORD_HASH and ignoring OPERATOR_PASSWORD.",
        );
      }
      passwordHash = passwordHashEnv;
    } else {
      console.warn(
        "OPERATOR_PASSWORD is set without OPERATOR_PASSWORD_HASH — hashing " +
          "it in memory at seed time. Prefer pre-computing " +
          "OPERATOR_PASSWORD_HASH for production.",
      );
      passwordHash = await hashPassword(passwordEnv as string);
    }

    const id = randomUUID();
    await client.query(
      'INSERT INTO "Operator" (id, username, "passwordHash", "createdAt") VALUES ($1, $2, $3, now())',
      [id, username, passwordHash],
    );
    console.log(`Seed: provisioned operator "${username}".`);

    // Create default workspace for the operator
    const workspaceId = randomUUID();
    const slug = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
    await client.query(
      'INSERT INTO "Workspace" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
      [workspaceId, `${username}'s workspace`, slug],
    );

    // Create membership
    const membershipId = randomUUID();
    await client.query(
      'INSERT INTO "WorkspaceMember" (id, "workspaceId", "operatorId", role, "joinedAt") VALUES ($1, $2, $3, $4, now())',
      [membershipId, workspaceId, id, "OWNER"],
    );
    console.log(
      `Seed: created default workspace "${slug}" for operator "${username}".`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
