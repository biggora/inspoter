import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Frozen contract (plan.md §5.1): cookie name "session", value = opaque
// Session.id; requireOperator() in src/lib/auth/dal.ts validates it against
// the DB and returns the associated Operator (or redirects when invalid —
// covered by the e2e AC-AUTH-001 suite, since redirect() is browser-facing).
// Mode B: requireOperator()'s real body (Step 4) is implemented — this
// exercises the happy path directly against a seeded Operator + Session.

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" ? { name, value: seededSessionId } : undefined,
  }),
}));

let seededSessionId = "";
const createdOperatorIds: string[] = [];

afterAll(async () => {
  await db.session.deleteMany({ where: { operatorId: { in: createdOperatorIds } } });
  await db.operator.deleteMany({ where: { id: { in: createdOperatorIds } } });
});

describe("AC-AUTH-002 (backend layer): requireOperator() session contract", () => {
  it("resolves with the Operator when the `session` cookie matches a live, unexpired Session", async () => {
    const operator = await db.operator.create({
      data: {
        username: `tester-${randomUUID()}`,
        passwordHash: "unused-in-this-test",
      },
    });
    createdOperatorIds.push(operator.id);

    const session = await db.session.create({
      data: {
        id: randomUUID(),
        operatorId: operator.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    seededSessionId = session.id;

    const { requireOperator } = await import("@/lib/auth/dal");
    const resolved = await requireOperator();

    expect(resolved.id).toBe(operator.id);
    expect(resolved.username).toBe(operator.username);
  });
});
