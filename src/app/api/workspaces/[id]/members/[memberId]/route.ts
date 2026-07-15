import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { operator } = await requireAuth();
  const { id, memberId } = await params;

  try {
    await workspacesService.removeMember(id, memberId, operator.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}
