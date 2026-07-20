import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as outgoingWebhooksService from "@/lib/services/outgoingWebhooks";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string; deliveryId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id, deliveryId } = await params;

  try {
    await outgoingWebhooksService.retryDelivery(id, deliveryId, workspace.id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
