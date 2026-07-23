import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { serviceCreateSchema } from "@/lib/validation/services";
import * as servicesService from "@/lib/services/services";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const services = await servicesService.list(workspace.id);
  return jsonResponse(services);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = serviceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const service = await servicesService.create(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "service",
      entityId: service.id,
      entityLabel: parsed.data.name,
    });
    return jsonResponse(service, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
