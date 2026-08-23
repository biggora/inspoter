import { NextResponse, type NextRequest } from "next/server";
import * as mailLabels from "@/lib/services/mail-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { updateMailLabelSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ labelId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  const parsed = updateMailLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const label = await mailLabels.updateLabel(
      auth.workspaceId,
      null,
      labelId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label);
  } catch (error) {
    return mapMailError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { labelId } = await params;

  try {
    await mailLabels.deleteLabel(auth.workspaceId, null, labelId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "mail_label",
      entityId: labelId,
    });
    return apiJsonResponse({ deleted: labelId });
  } catch (error) {
    return mapMailError(error);
  }
}
