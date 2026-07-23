import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    const service = await servicesService.checkNow(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "check",
      entityType: "service",
      entityId: id,
    });
    return jsonResponse(service);
  } catch (error) {
    if (error instanceof servicesService.ServiceNotFoundError) {
      return jsonResponse({ error: "Resource not found." }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
