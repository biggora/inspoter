import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

// Frozen contract (plan.md §5.1): `login(formData)` is a Server Action in
// src/app/login/actions.ts returning `{ ok: true } | { ok: false, error:
// string }` (AC-AUTH-002/003); `logout()` invalidates the session
// (AC-AUTH-004). Mode B: both are implemented — this fixture seeds the
// Operator with a real scrypt hash via the real hashPassword() primitive
// (not a placeholder string) so login()'s verifyPassword() call succeeds
// honestly, per the same contract the real login flow uses.

const username = `tester-${randomUUID()}`;
const password = "Test1234!";
const createdOperatorIds: string[] = [];

afterAll(async () => {
  await db.session.deleteMany({
    where: { operatorId: { in: createdOperatorIds } },
  });
  await db.operator.deleteMany({ where: { id: { in: createdOperatorIds } } });
});

function formDataFor(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("AC-AUTH-002/003: login Server Action contract", () => {
  it("AC-AUTH-002: valid operator credentials establish a session ({ ok: true })", async () => {
    // Seed an operator with a real scrypt hash (salt:hex) so verifyPassword()
    // in the real login() body succeeds honestly — this test targets the
    // action's return shape/contract, not the hashing algorithm itself.
    const operator = await db.operator.create({
      data: { username, passwordHash: await hashPassword(password) },
    });
    createdOperatorIds.push(operator.id);

    const { login } = await import("@/app/login/actions");
    const result = await login(formDataFor({ username, password }));

    expect(result).toEqual({ ok: true });
  });

  it("AC-AUTH-003: invalid credentials are rejected with an error and no session row is created", async () => {
    const { login } = await import("@/app/login/actions");
    const before = await db.session.count();

    const result = await login(
      formDataFor({ username: "no-such-operator", password: "wrong" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
    expect(await db.session.count()).toBe(before);
  });
});
