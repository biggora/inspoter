import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Operator, Session, Workspace } from "@/generated/prisma/client";
import { getValidSession, readSessionCookie } from "@/lib/auth/session";

// Auth Data Access Layer (architecture.md §5.3, ADR-012) — the authoritative
// auth gate (as opposed to proxy.ts's optimistic cookie-presence check).
// Validates the `session` cookie against the DB (exists + not expired) and
// returns the associated Operator, or redirects to /login. Called by the
// `w/[workspace]` layout and pages (requireWorkspaceBySlug) and every
// non-webhook API route handler (NFR-SEC-001). The sole sanctioned Prisma
// caller outside the service layer.

// Shared by every entry point below: cookie -> live Session -> Operator, or a
// redirect to /login. Wrapped in cache() (like requireWorkspaceBySlug) so the
// several DAL calls one render makes share a single cookie -> session ->
// operator lookup; React scopes the cache to the request.
const requireSessionOperator = cache(
  async (): Promise<{
    session: Session;
    operator: Operator;
  }> => {
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
  },
);

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

// A Next.js router prefetch (`next-router-prefetch: 1`, which every sidebar
// <Link> sends once hydrated) renders the workspace layout without the operator
// viewing it, so it must not overwrite last-used (OQ-5: "every render the
// operator actually views"). Next hides the flight headers from `headers()`
// (HIDDEN_REQUEST_HEADERS in async-storage/request-store.js) and strips them
// before the proxy runs, so the one place the render can still learn it is
// the work store's `isPrefetchRequest`.
function isRouterPrefetch(): boolean {
  return workAsyncStorage.getStore()?.isPrefetchRequest === true;
}

// Persist the workspace as the session's last used one, only when it differs
// and the request is not a router prefetch.
async function recordLastUsedWorkspace(
  operator: Operator,
  session: Session,
  workspace: Workspace,
): Promise<void> {
  if (workspace.id === session.activeWorkspaceId) return;
  if (isRouterPrefetch()) return;
  await db.session.update({
    where: { id: session.id },
    data: {
      activeWorkspaceId: workspace.id,
      activeWorkspaceOperatorId: operator.id,
    },
  });
}

/**
 * The workspace a URL without a `/w/<slug>` prefix should land on (legacy
 * redirect): session -> operator default -> first membership, each step
 * re-checking membership, and read-only. Null when the operator has no
 * membership.
 */
export async function resolveLastUsedWorkspace(): Promise<Workspace | null> {
  const { session, operator } = await requireSessionOperator();
  return findLastUsedWorkspace(operator, session);
}

/**
 * Page-side resolver for `/w/<slug>/...`: the URL, not the session, selects
 * the workspace. An unknown slug and a slug the operator is not a member of
 * are indistinguishable (`notFound()`). Every call records the workspace as
 * the session's last used one (written only when it changed, and never for a
 * router prefetch). Wrapped in
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

/**
 * Non-throwing membership-by-slug lookup for hints that must degrade quietly
 * (the legacy redirect's Referer slug): the member's workspace, or null for an
 * unknown slug and a non-member alike. Unlike requireWorkspaceBySlug() it never
 * calls notFound() and never records last-used.
 */
export async function findMemberWorkspaceBySlug(
  slug: string,
): Promise<Workspace | null> {
  const operator = await requireOperator();
  const membership = await db.workspaceMember.findFirst({
    where: { operatorId: operator.id, workspace: { slug } },
    include: { workspace: true },
  });
  return membership?.workspace ?? null;
}

// Browser API routes select their workspace with the `X-Inspoter-Workspace`
// header (the indicator stream with a query parameter): the id is parsed,
// checked against the operator's memberships on every request, and only then
// acts as the workspace. The carrier selects; membership authorizes. A missing
// or malformed value is a 400, a non-member or unknown id one identical 403,
// and the Session (last-used) is never written, so a tab choosing its
// workspace cannot move another tab (workspace-in-url.md §4.3).

export class WorkspaceContextRequiredError extends Error {
  constructor() {
    super("X-Inspoter-Workspace header is required");
    this.name = "WorkspaceContextRequiredError";
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

// The names ~170 route handlers already call; they delegate to the selectors
// below and return the same `{ operator, workspace }` shape.
export async function requireAuthWithWorkspaceHeader(
  request: NextRequest,
): Promise<AuthContext> {
  return requireWorkspaceFromHeader(request);
}

/**
 * The same selector for `EventSource`, which cannot set request headers — so
 * the indicator stream carries the workspace id as a query parameter instead
 * (src/app/api/indicators/stream/route.ts).
 */
export async function requireAuthWithWorkspaceParam(
  request: NextRequest,
  paramName = "workspace",
): Promise<AuthContext> {
  return requireWorkspaceFromParam(request, paramName);
}

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
