import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  try {
    await webhookTokensService.revoke(id, workspace.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
