import { NextResponse, type NextRequest } from "next/server";
import * as contactLabelsService from "@/lib/services/contact-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactLabelSchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(
    await contactLabelsService.listLabels(auth.workspaceId),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = contactLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const label = await contactLabelsService.createLabel(
      auth.workspaceId,
      null,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "contact_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label, { status: 201 });
  } catch (error) {
    return mapContactApiError(error);
  }
}
