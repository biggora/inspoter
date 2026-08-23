import { NextResponse, type NextRequest } from "next/server";
import * as serviceLabelsService from "@/lib/services/service-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { updateServiceLabelSchema } from "@/lib/validation/services";
import { mapServiceError } from "@/app/api/v1/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ labelId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  const parsed = updateServiceLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const label = await serviceLabelsService.updateLabel(
      auth.workspaceId,
      null,
      labelId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "service_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "services:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  try {
    await serviceLabelsService.deleteLabel(auth.workspaceId, null, labelId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "service_label",
      entityId: labelId,
    });
    return apiJsonResponse({ deleted: labelId });
  } catch (error) {
    return mapServiceError(error);
  }
}
