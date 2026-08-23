import { NextResponse, type NextRequest } from "next/server";
import * as servicesService from "@/lib/services/services";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  serviceCreateSchema,
  serviceListQuerySchema,
} from "@/lib/validation/services";
import { mapServiceError } from "@/app/api/v1/services/errors";

// Agent-facing monitored services. Session-cookie-free: the bearer token is
// the sole authority and carries the workspace (see src/lib/api/token-auth.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "services:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = serviceListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  const items = await servicesService.listOverview(auth.workspaceId);
  return apiJsonResponse(servicesService.filterOverview(items, parsed.data));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = serviceCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const service = await servicesService.create(auth.workspaceId, parsed.data);
    recordTokenActivity(auth, {
      action: "create",
      entityType: "service",
      entityId: service.id,
      entityLabel: service.name,
    });
    return apiJsonResponse(service, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
