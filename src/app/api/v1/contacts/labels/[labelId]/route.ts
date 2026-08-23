import { NextResponse, type NextRequest } from "next/server";
import * as contactLabelsService from "@/lib/services/contact-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactLabelUpdateSchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ labelId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  const parsed = contactLabelUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const label = await contactLabelsService.updateLabel(
      auth.workspaceId,
      null,
      labelId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "contact_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label);
  } catch (error) {
    return mapContactApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  try {
    await contactLabelsService.deleteLabel(auth.workspaceId, null, labelId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "contact_label",
      entityId: labelId,
    });
    return apiJsonResponse({ deleted: labelId });
  } catch (error) {
    return mapContactApiError(error);
  }
}
