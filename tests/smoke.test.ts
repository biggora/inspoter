import { describe, expect, it } from "vitest";

// Slice 0 test-infra smoke check (plan.md §4.2 item 13). Asserts the app's
// config loads and the Prisma client can reach the real Postgres instance
// (docker compose `db` service). This must stay green through every slice —
// it is the exit-gate check for `npm run test`, independent of any AC-ID.

describe("Slice 0 smoke", () => {
  it("loads the base env contract", async () => {
    const { env } = await import("@/lib/config/env");
    expect(env.DATABASE_URL).toBeTruthy();
    expect(env.LIST_PAGE_SIZE).toBeGreaterThan(0);
  });

  it("connects to the database via the Prisma client singleton", async () => {
    const { db } = await import("@/lib/db");
    const result = await db.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0].ok).toBe(1);
  });
});
