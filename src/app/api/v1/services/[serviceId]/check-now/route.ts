import { NextResponse, type NextRequest } from "next/server";
import * as servicesService from "@/lib/services/services";
import {
  apiJsonResponse,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { mapServiceError } from "@/app/api/v1/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ serviceId: string }>;
}

// Runs one check outside the schedule and answers with the service carrying
// its fresh status. Allowed on a paused service too — this is an explicit
// trigger, not a scheduler sweep.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;
  const { serviceId } = await params;

  try {
    const service = await servicesService.checkNow(serviceId, auth.workspaceId);
    recordTokenActivity(auth, {
      action: "check",
      entityType: "service",
      entityId: serviceId,
      entityLabel: service.name,
    });
    return apiJsonResponse(service);
  } catch (error) {
    return mapServiceError(error);
  }
}
