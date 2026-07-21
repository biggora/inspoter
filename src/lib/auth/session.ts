import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";

// Session primitives (architecture.md §5.2/§5.3, plan.md §5.1 frozen
// contract). Cookie name "session"; value = opaque Session.id. The DB
// Session row (exists + not expired) is the source of truth for validity —
// the cookie only carries the pointer (see auth DAL's getValidSession()
// call in src/lib/auth/dal.ts).

export const SESSION_COOKIE_NAME = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Code-review fix (Slice 1, minor #3): narrow the outside-request-scope
// catch so it only swallows Next.js's specific "dynamic API called outside
// a request scope" error (thrown by cookies()/headers() when there is no
// active Server Action / Route Handler context) and rethrows anything else.
// Next tags this error with a non-enumerable `__NEXT_ERROR_CODE: "E251"`
// (node_modules/next/dist/server/app-render/work-unit-async-storage.external.js);
// the message text is matched too as a defensive fallback since that
// property is an internal implementation detail, not a documented contract.
function isMissingRequestScopeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE;
  if (code === "E251") return true;
  return error.message.includes("was called outside a request scope");
}

export async function createSession(operatorId: string): Promise<Session> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await db.session.create({
    data: { id, operatorId, expiresAt },
  });

  try {
    const cookieStore = await cookies();
    const forwardedProto = (await headers()).get("x-forwarded-proto");
    cookieStore.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: forwardedProto === "https",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });
  } catch (error) {
    if (!isMissingRequestScopeError(error)) throw error;
    // Outside a Next.js request scope — e.g. a plain Vitest unit test
    // invoking the login() Server Action directly
    // (tests/unit/auth/login-action.test.ts), which does not mock
    // "next/headers" — this is a no-op; the DB Session row above (the
    // source of truth) is unaffected. In a real request this never throws.
  }

  return session;
}

export async function readSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function getValidSession(
  sessionId: string,
): Promise<Session | null> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function clearSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    if (!isMissingRequestScopeError(error)) throw error;
    // See createSession(): no-op outside a Next.js request scope.
  }
}

export async function switchWorkspace(
  sessionId: string,
  operatorId: string,
  workspaceId: string,
): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: {
      activeWorkspaceId: workspaceId,
      activeWorkspaceOperatorId: operatorId,
    },
  });
}

// Shared by the password-login Server Action and the Authentik callback
// route: attaches the operator's first workspace membership (by joinedAt) to
// the freshly-created session, if any exists. Returns whether a workspace was
// found and attached, so callers can route operators with zero memberships to
// a "no workspace yet" landing page instead of the dashboard.
export async function establishInitialWorkspace(
  sessionId: string,
  operatorId: string,
): Promise<boolean> {
  const membership = await db.workspaceMember.findFirst({
    where: { operatorId },
    orderBy: { joinedAt: "asc" },
  });
  if (!membership) return false;

  await switchWorkspace(sessionId, operatorId, membership.workspaceId);
  return true;
}
