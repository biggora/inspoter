import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { readSessionCookie, switchWorkspace } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator } = authResult;

  const body = await request.json().catch(() => null);
  const workspaceId = body?.workspaceId;
  if (!workspaceId || typeof workspaceId !== "string") {
    return jsonResponse(
      { error: "workspaceId is required" },
      { status: 400 },
    );
  }

  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_operatorId: { workspaceId, operatorId: operator.id },
    },
  });
  if (!membership) {
    return jsonResponse(
      { error: "Not a member of this workspace" },
      { status: 403 },
    );
  }

  const sessionId = await readSessionCookie();
  if (!sessionId) {
    return jsonResponse({ error: "No session" }, { status: 401 });
  }

  await switchWorkspace(sessionId, operator.id, workspaceId);
  return jsonResponse({ ok: true });
}
