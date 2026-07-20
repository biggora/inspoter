import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as outgoingWebhooksService from "@/lib/services/outgoingWebhooks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  try {
    const result = await outgoingWebhooksService.listDeliveries(
      id,
      workspace.id,
      { cursor },
    );
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
