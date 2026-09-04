import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Operator, Workspace } from "@/generated/prisma/client";
import { getValidSession, readSessionCookie } from "@/lib/auth/session";

// Auth Data Access Layer (architecture.md §5.3, ADR-012) — the authoritative
// auth gate (as opposed to proxy.ts's optimistic cookie-presence check).
// Validates the `session` cookie against the DB (exists + not expired) and
// returns the associated Operator, or redirects to /login. Called by
// `(dashboard)/layout.tsx` and every non-webhook API route handler
// (NFR-SEC-001). The sole sanctioned Prisma caller outside the service layer.

export async function requireOperator(): Promise<Operator> {
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

export async function requireAuth(): Promise<AuthContext> {
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

  // Resolve workspace from session
  let workspace: Workspace | null = null;
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
    if (membership) {
      workspace = membership.workspace;
    }
  }

  // Fallback: default workspace, if set and membership is valid
  if (!workspace) {
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
      if (defaultMembership) {
        workspace = defaultMembership.workspace;
      }
    }
  }

  // Fallback: first workspace the user belongs to
  if (!workspace) {
    const membership = await db.workspaceMember.findFirst({
      where: { operatorId: operator.id },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });
    if (!membership) {
      redirect({ href: "/login", locale: await getLocale() });
      throw new Error("unreachable");
    }
    workspace = membership.workspace;
  }

  // Persist for next request (covers both default and joinedAt fallback)
  if (workspace.id !== session.activeWorkspaceId) {
    await db.session.update({
      where: { id: session.id },
      data: {
        activeWorkspaceId: workspace.id,
        activeWorkspaceOperatorId: operator.id,
      },
    });
  }

  return { operator, workspace };
}

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

// One assertion behind both carriers, so the staleness rule cannot drift
// between the header form and the query-parameter form.
function assertWorkspaceContext(
  workspace: Workspace,
  provided: string | null,
): void {
  if (!provided) {
    throw new WorkspaceContextRequiredError();
  }
  if (provided !== workspace.id) {
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
