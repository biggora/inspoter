import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  await requireAuth();
  const { id, memberId } = await params;

  try {
    await workspacesService.removeMember(id, memberId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
