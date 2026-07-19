import "@testing-library/jest-dom/vitest";
import { afterAll } from "vitest";

// The forks pool runs each test file in its own worker process, so the Prisma
// client (src/lib/db.ts) — cached on globalThis — is constructed once per
// DB-touching file and its pg pool is otherwise only released when the worker
// is killed. Close it gracefully after each file so sockets are torn down
// cleanly instead of being severed by the process kill. Guarded on the cache
// so non-DB files (which never construct the client) create no pool here.
afterAll(async () => {
  const cached = (
    globalThis as { prisma?: { $disconnect: () => Promise<void> } }
  ).prisma;
  if (cached) await cached.$disconnect();
});
