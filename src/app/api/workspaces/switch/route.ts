import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { readSessionCookie, switchWorkspace } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const { operator } = await requireAuth();

  const body = await request.json().catch(() => null);
  const workspaceId = body?.workspaceId;
  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json(
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
    return NextResponse.json(
      { error: "Not a member of this workspace" },
      { status: 403 },
    );
  }

  const sessionId = await readSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  await switchWorkspace(sessionId, operator.id, workspaceId);
  return NextResponse.json({ ok: true });
}
