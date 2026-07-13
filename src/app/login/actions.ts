"use server";

import { redirect } from "next/navigation";
import { findOperatorByUsername } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readSessionCookie,
  switchWorkspace,
} from "@/lib/auth/session";

// Login/logout Server Actions — frozen contract (plan.md §5.1, §5.3 Step 6).
// `login(formData)` returns `{ ok: true } | { ok: false, error: string }`
// (AC-AUTH-002/003); `logout()` invalidates the session and redirects to
// /login (AC-AUTH-004). This file lives under src/app/login/ but is
// backend-dev-owned per plan.md §5.3 step 6 (disjoint from frontend-dev's
// src/app/login/page.tsx, which imports and calls `login`) — see this
// task's report for the explicit scope-conflict resolution.
//
// ADR-012 (code-review fix, minor #2): this action never calls Prisma
// directly — the operator lookup lives in the auth DAL
// (findOperatorByUsername, src/lib/auth/dal.ts).

export type LoginResult = { ok: true } | { ok: false; error: string };

// Code-review fix (minor #5, timing side-channel): a precomputed, valid-
// format scrypt hash ("salt:derived-key") that matches no real password.
// When the operator lookup misses, we still run verifyPassword() against
// this constant so a nonexistent-username response takes roughly the same
// time as a wrong-password response (no username-enumeration timing tell).
const DUMMY_PASSWORD_HASH =
  "4855ff453c2db0b373f8a0dff669b62c:4eba823edba466dd5eb77f9a7c337c1d8e2d1982c735898df0d3d04ec44b918881d1b81c1c158b78752f3372cd73dba3e2a18199dc2b795b0a32d8d8acf370fe";

export async function login(formData: FormData): Promise<LoginResult> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { ok: false, error: "Username and password are required." };
  }

  const operator = await findOperatorByUsername(username);
  if (!operator) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return { ok: false, error: "Invalid username or password." };
  }

  const valid = await verifyPassword(password, operator.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid username or password." };
  }

  const session = await createSession(operator.id);

  const membership = await db.workspaceMember.findFirst({
    where: { operatorId: operator.id },
    orderBy: { joinedAt: "asc" },
  });
  if (membership) {
    await switchWorkspace(session.id, membership.workspaceId);
  }

  return { ok: true };
}

export async function logout(): Promise<void> {
  const sessionId = await readSessionCookie();
  if (sessionId) {
    await deleteSession(sessionId);
  }
  await clearSessionCookie();
  redirect("/login");
}
