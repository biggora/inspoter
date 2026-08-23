import { NextResponse, type NextRequest } from "next/server";
import * as servicesService from "@/lib/services/services";
import {
  apiJsonResponse,
  apiValidationError,
  requireApiToken,
} from "@/lib/api/token-auth";
import { serviceChecksQuerySchema } from "@/lib/validation/services";
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

  const parsed = serviceChecksQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    return apiJsonResponse(
      await servicesService.listChecks(serviceId, auth.workspaceId, {
        cursor: parsed.data.cursor,
        pageSize: parsed.data.pageSize,
      }),
    );
  } catch (error) {
    return mapServiceError(error);
  }
}
