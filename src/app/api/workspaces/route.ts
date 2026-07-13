import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { createWorkspaceSchema } from "@/lib/validation/workspaces";
import * as workspacesService from "@/lib/services/workspaces";
import { toErrorResponse } from "@/lib/api/errors";

export async function GET() {
  const { operator } = await requireAuth();
  const workspaces = await workspacesService.listForOperator(operator.id);
  return NextResponse.json(workspaces);
}

export async function POST(request: NextRequest) {
  const { operator } = await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspace = await workspacesService.createWorkspace(
      operator.id,
      parsed.data,
    );
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
