import { NextResponse, type NextRequest } from "next/server";
import * as servicesService from "@/lib/services/services";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { serviceUpdateSchema } from "@/lib/validation/services";
import { mapServiceError } from "@/app/api/v1/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:read");
  if (auth instanceof NextResponse) return auth;
  const { serviceId } = await params;

  const service = await servicesService.get(serviceId, auth.workspaceId);
  if (!service) return apiNotFound("Service");
  return apiJsonResponse(service);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;
  const { serviceId } = await params;

  const parsed = serviceUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const service = await servicesService.update(
      serviceId,
      auth.workspaceId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "service",
      entityId: service.id,
      entityLabel: service.name,
    });
    return apiJsonResponse(service);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;
  const { serviceId } = await params;

  // Read first so the journal entry can name the service and a foreign id
  // answers 404 rather than the delete's raw Prisma failure.
  const service = await servicesService.get(serviceId, auth.workspaceId);
  if (!service) return apiNotFound("Service");

  try {
    await servicesService.remove(serviceId, auth.workspaceId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "service",
      entityId: serviceId,
      entityLabel: service.name,
    });
    return apiJsonResponse({ deleted: serviceId });
  } catch (error) {
    return mapServiceError(error);
  }
}
