import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Operator, Session, Workspace } from "@/generated/prisma/client";
import { getValidSession, readSessionCookie } from "@/lib/auth/session";

// Auth Data Access Layer (architecture.md §5.3, ADR-012) — the authoritative
// auth gate (as opposed to proxy.ts's optimistic cookie-presence check).
// Validates the `session` cookie against the DB (exists + not expired) and
// returns the associated Operator, or redirects to /login. Called by
// `(dashboard)/layout.tsx` and every non-webhook API route handler
// (NFR-SEC-001). The sole sanctioned Prisma caller outside the service layer.

// Shared by every entry point below: cookie -> live Session -> Operator, or a
// redirect to /login.
async function requireSessionOperator(): Promise<{
  session: Session;
  operator: Operator;
}> {
  const sessionId = await readSessionCookie();
  if (!sessionId) {
    redirect({ href: "/login", locale: await getLocale() });
    throw new Error("unreachable");
  }

  const session = await getValidSession(sessionId);
  if (!session) {
    redirect({ href: "/login", locale: await getLocale() });
    throw new Error("unreachable");
  }

  const operator = await db.operator.findUnique({
    where: { id: session.operatorId },
  });
  if (!operator) {
    redirect({ href: "/login", locale: await getLocale() });
    throw new Error("unreachable");
  }

  return { session, operator };
}

export async function requireOperator(): Promise<Operator> {
  const { operator } = await requireSessionOperator();
  return operator;
}

// Code-review fix (Slice 1, minor #2, ADR-012): the login Server Action
// (src/app/login/actions.ts) must not call Prisma directly. This lookup
// lives alongside requireOperator() as the DAL is the sole sanctioned
// Prisma caller outside the service layer.
export async function findOperatorByUsername(
  username: string,
): Promise<Operator | null> {
  return db.operator.findUnique({ where: { username } });
}

export interface AuthContext {
  operator: Operator;
  workspace: Workspace;
}

// The "last used" workspace: session -> operator default -> first membership
// (each step re-checks membership). Never writes the Session.
async function findLastUsedWorkspace(
  operator: Operator,
  session: Session,
): Promise<Workspace | null> {
  if (session.activeWorkspaceId) {
    // Verify membership exists for this workspace
    const membership = await db.workspaceMember.findUnique({
      where: {
        workspaceId_operatorId: {
          workspaceId: session.activeWorkspaceId,
          operatorId: operator.id,
        },
      },
      include: { workspace: true },
    });
    if (membership) return membership.workspace;
  }

  // Fallback: default workspace, if set and membership is valid
  if (operator.defaultWorkspaceId) {
    const defaultMembership = await db.workspaceMember.findUnique({
      where: {
        workspaceId_operatorId: {
          workspaceId: operator.defaultWorkspaceId,
          operatorId: operator.id,
        },
      },
      include: { workspace: true },
    });
    if (defaultMembership) return defaultMembership.workspace;
  }

  // Fallback: first workspace the user belongs to
  const membership = await db.workspaceMember.findFirst({
    where: { operatorId: operator.id },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" },
  });
  return membership?.workspace ?? null;
}

// Persist the workspace as the session's last used one, only when it differs.
async function recordLastUsedWorkspace(
  operator: Operator,
  session: Session,
  workspace: Workspace,
): Promise<void> {
  if (workspace.id === session.activeWorkspaceId) return;
  await db.session.update({
    where: { id: session.id },
    data: {
      activeWorkspaceId: workspace.id,
      activeWorkspaceOperatorId: operator.id,
    },
  });
}

export async function requireAuth(): Promise<AuthContext> {
  const { session, operator } = await requireSessionOperator();

  const workspace = await findLastUsedWorkspace(operator, session);
  if (!workspace) {
    redirect({ href: "/login", locale: await getLocale() });
    throw new Error("unreachable");
  }

  // Persist for next request (covers both default and joinedAt fallback)
  await recordLastUsedWorkspace(operator, session, workspace);

  return { operator, workspace };
}

/**
 * The workspace a URL without a `/w/<slug>` prefix should land on (legacy
 * redirect): the same session -> default -> first-membership order as
 * requireAuth(), but read-only. Null when the operator has no membership.
 */
export async function resolveLastUsedWorkspace(): Promise<Workspace | null> {
  const { session, operator } = await requireSessionOperator();
  return findLastUsedWorkspace(operator, session);
}

/**
 * Page-side resolver for `/w/<slug>/...`: the URL, not the session, selects
 * the workspace. An unknown slug and a slug the operator is not a member of
 * are indistinguishable (`notFound()`). Every call records the workspace as
 * the session's last used one (written only when it changed). Wrapped in
 * cache() so a layout and its page share one lookup per request.
 */
export const requireWorkspaceBySlug = cache(
  async (slug: string): Promise<AuthContext> => {
    const { session, operator } = await requireSessionOperator();
    const membership = await db.workspaceMember.findFirst({
      where: { operatorId: operator.id, workspace: { slug } },
      include: { workspace: true },
    });
    if (!membership) {
      notFound();
    }
    await recordLastUsedWorkspace(operator, session, membership.workspace);
    return { operator, workspace: membership.workspace };
  },
);

// R2.1c (remediation-plan.md): browser API routes must check the
// `X-Inspoter-Workspace` header against the session's active workspace.
// This rejects stale-tab mutations — if the operator switches workspace in
// tab 1, tab 2 still sends the old workspace id and gets a 409 instead of
// silently mutating the wrong workspace. The header never selects
// authority; requireAuth() above remains the sole source of the workspace.

export class WorkspaceContextRequiredError extends Error {
  constructor() {
    super("X-Inspoter-Workspace header is required");
    this.name = "WorkspaceContextRequiredError";
  }
}

export class WorkspaceContextStaleError extends Error {
  constructor() {
    super("Workspace context is stale — please refresh");
    this.name = "WorkspaceContextStaleError";
  }
}

// Same error for a workspace id that does not exist and one the operator is
// not a member of, so the response cannot be used to probe for workspaces.
export class WorkspaceAccessDeniedError extends Error {
  constructor() {
    super("Workspace access denied");
    this.name = "WorkspaceAccessDeniedError";
  }
}

// A workspace id as carried by the header / query parameter: 1..128 printable
// ASCII characters (NFR-SEC-004). Anything else is "no usable context".
const WORKSPACE_ID_PATTERN = /^[\x20-\x7e]{1,128}$/;

function parseWorkspaceId(provided: string | null): string {
  if (!provided || !WORKSPACE_ID_PATTERN.test(provided)) {
    throw new WorkspaceContextRequiredError();
  }
  return provided;
}

// One assertion behind both carriers, so the staleness rule cannot drift
// between the header form and the query-parameter form.
function assertWorkspaceContext(
  workspace: Workspace,
  provided: string | null,
): void {
  if (parseWorkspaceId(provided) !== workspace.id) {
    throw new WorkspaceContextStaleError();
  }
}

export async function requireAuthWithWorkspaceHeader(
  request: NextRequest,
): Promise<AuthContext> {
  const { operator, workspace } = await requireAuth();
  assertWorkspaceContext(
    workspace,
    request.headers.get("x-inspoter-workspace"),
  );
  return { operator, workspace };
}

/**
 * The same check for `EventSource`, which cannot set request headers — so the
 * indicator stream carries the workspace id as a query parameter instead
 * (src/app/api/indicators/stream/route.ts). The session still rides the
 * cookie, and requireAuth() above remains the sole authority on which
 * workspace is active; the parameter only detects a stale tab, exactly as the
 * header does.
 */
export async function requireAuthWithWorkspaceParam(
  request: NextRequest,
  paramName = "workspace",
): Promise<AuthContext> {
  const { operator, workspace } = await requireAuth();
  assertWorkspaceContext(
    workspace,
    request.nextUrl.searchParams.get(paramName),
  );
  return { operator, workspace };
}

// Selector form (not used by any live route yet): the carrier picks the
// workspace, after a membership check on every request. The Session is never
// written — a tab choosing its own workspace must not move any other tab.
async function requireMemberWorkspace(
  provided: string | null,
): Promise<AuthContext> {
  const operator = await requireOperator();
  const workspaceId = parseWorkspaceId(provided);
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId: operator.id } },
    include: { workspace: true },
  });
  if (!membership) {
    throw new WorkspaceAccessDeniedError();
  }
  return { operator, workspace: membership.workspace };
}

export async function requireWorkspaceFromHeader(
  request: NextRequest,
): Promise<AuthContext> {
  return requireMemberWorkspace(request.headers.get("x-inspoter-workspace"));
}

export async function requireWorkspaceFromParam(
  request: NextRequest,
  paramName = "workspace",
): Promise<AuthContext> {
  return requireMemberWorkspace(request.nextUrl.searchParams.get(paramName));
}
