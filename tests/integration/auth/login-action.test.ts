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
const password = "Test1234!safe";
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

    const { login } = await import("@/app/[locale]/login/actions");
    const result = await login(formDataFor({ username, password }));

    expect(result).toEqual({ ok: true });
  });

  it("AC-AUTH-003: invalid credentials are rejected with an error and no session row is created", async () => {
    const { login } = await import("@/app/[locale]/login/actions");
    const before = await db.session.count();

    const result = await login(
      formDataFor({ username: "no-such-operator", password: "wrong" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
    expect(await db.session.count()).toBe(before);
  });

  it("throttles a normalized username without revealing whether it exists", async () => {
    await db.loginRateLimitBucket.deleteMany();
    const { login } = await import("@/app/[locale]/login/actions");
    const { env } = await import("@/lib/config/env");
    const { loginUsernameBucketKey } = await import(
      "@/lib/auth/login-rate-limit"
    );

    // CI runs the whole verification job with LOGIN_RATE_LIMIT_USERNAME raised
    // to 5000 (the e2e suite shares one username bucket — see
    // .github/workflows/ci.yml), so driving the bucket over the limit with
    // real attempts is neither practical nor limit-independent. Seed the
    // bucket for "  Missing User  " one attempt below the configured limit
    // instead; the differently-spelled "MISSING USER" below must hit the same
    // bucket because the key is built from the normalized username.
    await db.loginRateLimitBucket.create({
      data: {
        key: loginUsernameBucketKey("  Missing User  "),
        count: env.LOGIN_RATE_LIMIT_USERNAME - 1,
        windowStartedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // One attempt below the limit: the username is missing, but the response
    // is the generic credential error — no existence reveal.
    const allowed = await login(
      formDataFor({ username: "MISSING USER", password: "wrong" }),
    );
    expect(allowed).toEqual({
      ok: false,
      error: "Invalid username or password.",
    });

    // Tipping over the limit throttles without touching the operator table.
    const blocked = await login(
      formDataFor({ username: "MISSING USER", password: "wrong" }),
    );
    expect(blocked).toEqual({ ok: false, error: "LOGIN_RATE_LIMITED" });
    await db.loginRateLimitBucket.deleteMany();
  });
});
