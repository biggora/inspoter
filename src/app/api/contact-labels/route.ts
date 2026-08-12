import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactLabelsService from "@/lib/services/contact-labels";
import { recordActivity } from "@/lib/services/activity";
import { contactLabelSchema } from "@/lib/validation/contacts";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  return jsonResponse(
    await contactLabelsService.listLabels(authResult.workspace.id),
  );
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = contactLabelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await contactLabelsService.createLabel(
      workspace.id,
      operator.id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "contact_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return jsonResponse(label, { status: 201 });
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
