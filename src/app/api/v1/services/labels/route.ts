import { NextResponse, type NextRequest } from "next/server";
import * as serviceLabelsService from "@/lib/services/service-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { createServiceLabelSchema } from "@/lib/validation/services";
import { mapServiceError } from "@/app/api/v1/services/errors";

// Static segment, so it wins over /api/v1/services/[serviceId] in the App
// Router — the same placement the browser routes use next door.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "services:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(
    await serviceLabelsService.listLabels(auth.workspaceId),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = createServiceLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    // A token has no operator behind it, so the membership check is skipped
    // and the token's own workspace scope is the authority.
    const label = await serviceLabelsService.createLabel(
      auth.workspaceId,
      null,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "service_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label, { status: 201 });
  } catch (error) {
    return mapServiceError(error);
  }
}
