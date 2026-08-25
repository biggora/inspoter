import "dotenv/config";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { preserveLegacyAgentTokens } from "./legacy-agent-token-preflight.mjs";
import REPOSITORY_ROOT from "./repository-root.cjs";

const require = createRequire(resolve(REPOSITORY_ROOT, "package.json"));
const prismaCli = require.resolve("prisma/build/index.js");

export async function migrateDeploy(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const copied = await preserveLegacyAgentTokens(databaseUrl);
  console.log(
    `[migration-preflight] preserved ${copied} legacy agent token(s).`,
  );
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else
        rejectPromise(new Error(`prisma migrate deploy exited with ${code}`));
    });
  });
}

if (process.argv[1]?.endsWith("migrate-deploy.mjs")) {
  migrateDeploy().catch((error) => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exitCode = 1;
  });
}
